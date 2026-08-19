'use strict';

const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const books = db.collection('books');
const contacts = db.collection('seller_contacts');
const USERS = db.collection('users');
const FAVORITES = db.collection('favorites');
const MAX_PAGE_SIZE = 50;

class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function requestId() {
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function stringValue(value, field, min, max, required = true) {
  if (!required && (value === undefined || value === null || value === '')) {
    return '';
  }
  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_ERROR', `${field}格式不正确`);
  }
  const text = value.trim();
  if (text.length < min || text.length > max) {
    throw new AppError('VALIDATION_ERROR', `${field}长度应为${min}-${max}个字符`);
  }
  return text;
}

function identifier(value, field, required = true) {
  const text = stringValue(value, field, 1, 64, required);
  if (text && !/^[A-Za-z0-9_:-]+$/.test(text)) {
    throw new AppError('VALIDATION_ERROR', `${field}包含非法字符`);
  }
  return text;
}

function money(value, field, required = true) {
  if (!required && (value === undefined || value === null || value === '')) {
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100000 || Math.round(number * 100) !== number * 100) {
    throw new AppError('VALIDATION_ERROR', `${field}应为有效金额`);
  }
  return number;
}

function fileIds(value, required) {
  if (!Array.isArray(value) || (required && value.length === 0) || value.length > 9) {
    throw new AppError('VALIDATION_ERROR', '图片数量应为1-9张');
  }
  return value.map((item) => stringValue(item, '图片', 1, 512));
}

function pageSize(value) {
  if (value === undefined) {
    return 20;
  }
  const size = Number(value);
  if (!Number.isInteger(size) || size < 1 || size > MAX_PAGE_SIZE) {
    throw new AppError('VALIDATION_ERROR', `pageSize应为1-${MAX_PAGE_SIZE}的整数`);
  }
  return size;
}

function normalizeKeyword(value) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildKeywords(book) {
  const source = [book.title, book.author, book.courseName, book.isbn]
    .filter(Boolean)
    .map(normalizeKeyword);
  const words = source.flatMap((text) => [text, ...text.split(/[\s,，;；/]+/)])
    .filter((text) => text.length >= 2);
  return Array.from(new Set(words)).slice(0, 50);
}

function encodeCursor(book, field) {
  const value = book[field];
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Buffer.from(JSON.stringify({ value: date.toISOString(), id: book._id }), 'utf8').toString('base64');
}

function decodeCursor(cursor) {
  if (!cursor) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
    const value = new Date(parsed.value);
    if (!parsed.id || Number.isNaN(value.getTime())) {
      throw new Error('invalid cursor');
    }
    return { value, id: parsed.id };
  } catch (error) {
    throw new AppError('VALIDATION_ERROR', '游标无效');
  }
}

function publicListItem(book) {
  return {
    id: book._id,
    schoolId: book.schoolId,
    schoolName: book.schoolName || '',
    campusId: book.campusId || '',
    campusName: book.campusName || '',
    provinceId: book.provinceId || '',
    provinceName: book.provinceName || '',
    schoolCity: book.schoolCity || '',
    category: book.category,
    isbn: book.isbn || '',
    title: book.title,
    author: book.author || '',
    courseName: book.courseName || '',
    salePrice: book.salePrice,
    originalPrice: book.originalPrice,
    condition: book.condition,
    coverFileId: book.coverFileId,
    status: book.status,
    viewCount: book.viewCount || 0,
    favoriteCount: book.favoriteCount || 0,
    intentionCount: book.intentionCount || 0,
    publishedAt: book.publishedAt,
    createdAt: book.createdAt
  };
}

function publicDetail(book) {
  return {
    ...publicListItem(book),
    publisher: book.publisher || '',
    imageFileIds: Array.isArray(book.imageFileIds) ? book.imageFileIds : [],
    description: book.description || '',
    updatedAt: book.updatedAt
  };
}

function ownerBook(book) {
  return {
    ...publicDetail(book),
    moderationResult: book.moderationResult || null
  };
}

async function assertActiveUser(openId) {
  const result = await USERS.where({ _openid: openId }).limit(1).get();
  const user = result.data[0];
  if (!user || user.status === 'deleted') {
    throw new AppError('USER_NOT_FOUND', '请先初始化用户资料');
  }
  if (user.status === 'blocked') {
    throw new AppError('FORBIDDEN', '账号当前不可用');
  }
  return user;
}

async function checkText(content, openId) {
  let result;
  try {
    result = await cloud.openapi.security.msgSecCheck({
      content: content.slice(0, 5000),
      version: 2,
      scene: 2,
      openid: openId
    });
  } catch (error) {
    throw new AppError('CONTENT_CHECK_FAILED', '内容安全检测暂不可用');
  }
  const errCode = result && (result.errCode ?? result.errcode ?? 0);
  if (errCode !== 0) {
    throw new AppError('CONTENT_CHECK_FAILED', '内容安全检测暂不可用');
  }
  const suggestion = result && result.result && result.result.suggest;
  if (suggestion && suggestion !== 'pass') {
    throw new AppError('CONTENT_REJECTED', '提交内容未通过安全检测');
  }
}

function encryptionKey() {
  const secret = process.env.CONTACT_ENCRYPTION_KEY;
  if (!secret || secret.length < 16) {
    throw new AppError('CONTACT_CONFIG_ERROR', '联系方式加密配置缺失');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptContact(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

function contactPayload(event) {
  const contact = event.contact;
  if (!contact || typeof contact !== 'object') {
    throw new AppError('VALIDATION_ERROR', '请填写联系方式');
  }
  const contactType = stringValue(contact.type, '联系方式类型', 1, 16);
  if (!['wechat', 'phone'].includes(contactType)) {
    throw new AppError('VALIDATION_ERROR', '联系方式类型无效');
  }
  const contactValue = stringValue(contact.value, '联系方式', 3, 64);
  if (contactType === 'phone' && !/^\+?[0-9 -]{6,20}$/.test(contactValue)) {
    throw new AppError('VALIDATION_ERROR', '手机号格式不正确');
  }
  if (contactType === 'wechat' && !/^[A-Za-z0-9_-]{3,64}$/.test(contactValue)) {
    throw new AppError('VALIDATION_ERROR', '微信号格式不正确');
  }
  return { contactType, contactValue };
}

function bookPayload(event, partial) {
  const source = event.book && typeof event.book === 'object' ? event.book : event;
  const result = {};
  const assign = (key, parser) => {
    if (!partial || hasOwn(source, key)) {
      result[key] = parser(source[key]);
    }
  };

  assign('schoolId', (value) => identifier(value, '学校'));
  assign('schoolName', (value) => stringValue(value, '学校名称', 1, 100));
  assign('campusId', (value) => identifier(value, '校区', false));
  assign('campusName', (value) => stringValue(value, '校区名称', 1, 40));
  assign('provinceId', (value) => identifier(value, '省级区域', false));
  assign('provinceName', (value) => stringValue(value, '省级区域名称', 0, 32, false));
  assign('schoolCity', (value) => stringValue(value, '学校城市', 0, 32, false));
  assign('category', (value) => identifier(value, '分类'));
  assign('isbn', (value) => {
    const text = stringValue(value, 'ISBN', 0, 20, false).replace(/[-\s]/g, '');
    if (text && !/^[0-9Xx]{10,13}$/.test(text)) {
      throw new AppError('VALIDATION_ERROR', 'ISBN格式不正确');
    }
    return text.toUpperCase();
  });
  assign('title', (value) => stringValue(value, '书名', 1, 100));
  assign('courseName', (value) => stringValue(value, '课程名', 0, 100, false));
  assign('author', (value) => stringValue(value, '作者', 0, 100, false));
  assign('publisher', (value) => stringValue(value, '出版社', 0, 100, false));
  assign('originalPrice', (value) => money(value, '原价', false));
  assign('salePrice', (value) => money(value, '售价'));
  assign('condition', (value) => stringValue(value, '成色', 1, 32));
  assign('imageFileIds', (value) => fileIds(value, true));
  assign('description', (value) => stringValue(value, '描述', 0, 2000, false));

  if (result.imageFileIds) {
    result.coverFileId = result.imageFileIds[0];
  }
  if (hasOwn(result, 'title')) {
    result.normalizedTitle = normalizeKeyword(result.title);
  }
  return result;
}

function textForCheck(payload) {
  return [payload.title, payload.author, payload.publisher, payload.courseName, payload.description]
    .filter(Boolean)
    .join('\n');
}

async function queryPage(baseCondition, cursor, size, field) {
  const decoded = decodeCursor(cursor);
  const conditions = [baseCondition];
  if (decoded) {
    conditions.push(_.or([
      { [field]: _.lt(decoded.value) },
      { [field]: _.eq(decoded.value), _id: _.lt(decoded.id) }
    ]));
  }
  const condition = conditions.length === 1 ? conditions[0] : _.and(conditions);
  const result = await books.where(condition)
    .orderBy(field, 'desc')
    .orderBy('_id', 'desc')
    .limit(size + 1)
    .get();
  const hasMore = result.data.length > size;
  const rows = result.data.slice(0, size);
  return {
    rows,
    hasMore,
    nextCursor: hasMore && rows.length ? encodeCursor(rows[rows.length - 1], field) : null
  };
}

async function list(event) {
  const size = pageSize(event.pageSize);
  const condition = { status: 'published', deletedAt: null };
  if (event.schoolId) condition.schoolId = identifier(event.schoolId, '学校');
  if (event.campusId) condition.campusId = identifier(event.campusId, '校区');
  if (event.category) condition.category = identifier(event.category, '分类');
  const page = await queryPage(condition, event.cursor, size, 'publishedAt');
  return {
    items: page.rows.map(publicListItem),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore
  };
}

async function detail(event, openId) {
  const bookId = stringValue(event.bookId, 'bookId', 1, 128);
  let result;
  try {
    result = await books.doc(bookId).get();
  } catch (error) {
    throw new AppError('BOOK_NOT_FOUND', '书籍不存在');
  }
  const book = result.data;
  if (!book || book.deletedAt || book.status !== 'published') {
    throw new AppError('BOOK_NOT_FOUND', '书籍不存在或不可见');
  }
  books.doc(bookId).update({ data: { viewCount: _.inc(1) } }).catch(() => {});
  const resultData = publicDetail(book);
  const sellerResult = await USERS.where({ _openid:book.sellerOpenId }).field({ nickname:true, avatarFileId:true }).limit(1).get();
  const seller = sellerResult.data[0] || {};
  const favoriteResult = await FAVORITES.where({ userOpenId:openId, bookId }).limit(1).get();
  resultData.seller = { nickname:seller.nickname || '同校书友', avatar:seller.avatarFileId || '' };
  resultData.isFavorite = favoriteResult.data.length > 0;
  return resultData;
}

async function search(event) {
  const keyword = normalizeKeyword(stringValue(event.keyword, '关键词', 2, 100));
  const size = pageSize(event.pageSize);
  const base = { status: 'published', deletedAt: null };
  if (event.schoolId) base.schoolId = identifier(event.schoolId, '学校');
  const match = _.or([{ isbn: keyword.toUpperCase().replace(/[-\s]/g, '') }, { searchKeywords: keyword }]);
  const decoded = decodeCursor(event.cursor);
  const conditions = [base, match];
  if (decoded) {
    conditions.push(_.or([
      { publishedAt: _.lt(decoded.value) },
      { publishedAt: _.eq(decoded.value), _id: _.lt(decoded.id) }
    ]));
  }
  const result = await books.where(_.and(conditions))
    .orderBy('publishedAt', 'desc')
    .orderBy('_id', 'desc')
    .limit(size + 1)
    .get();
  const hasMore = result.data.length > size;
  const rows = result.data.slice(0, size);
  return {
    items: rows.map(publicListItem),
    nextCursor: hasMore && rows.length ? encodeCursor(rows[rows.length - 1], 'publishedAt') : null,
    hasMore
  };
}

async function publish(event, openId) {
  await assertActiveUser(openId);
  const payload = bookPayload(event, false);
  const contact = contactPayload(event);
  await checkText(textForCheck(payload), openId);

  const now = new Date();
  const contactResult = await contacts.add({
    data: {
      ownerOpenId: openId,
      contactType: contact.contactType,
      contactValueEncrypted: encryptContact(contact.contactValue),
      isVisible: true,
      createdAt: now,
      updatedAt: now
    }
  });

  try {
    payload.searchKeywords = buildKeywords(payload);
    const result = await books.add({
      data: {
        ...payload,
        sellerOpenId: openId,
        contactId: contactResult._id,
        status: 'published',
        moderationResult: { text: 'pass', checkedAt: now },
        viewCount: 0,
        favoriteCount: 0,
        intentionCount: 0,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      }
    });
    const created = await books.doc(result._id).get();
    return ownerBook(created.data);
  } catch (error) {
    await contacts.doc(contactResult._id).remove().catch(() => {});
    throw error;
  }
}

async function getOwnedBook(bookId, openId) {
  let result;
  try {
    result = await books.doc(bookId).get();
  } catch (error) {
    throw new AppError('BOOK_NOT_FOUND', '书籍不存在');
  }
  if (!result.data || result.data.deletedAt) {
    throw new AppError('BOOK_NOT_FOUND', '书籍不存在');
  }
  if (result.data.sellerOpenId !== openId) {
    throw new AppError('FORBIDDEN', '无权操作此书籍');
  }
  return result.data;
}

async function update(event, openId) {
  await assertActiveUser(openId);
  const bookId = stringValue(event.bookId, 'bookId', 1, 128);
  const current = await getOwnedBook(bookId, openId);
  if (['sold', 'rejected'].includes(current.status)) {
    throw new AppError('BOOK_NOT_EDITABLE', '当前状态不可编辑');
  }
  const payload = bookPayload(event, true);
  if (Object.keys(payload).length === 0 && !event.contact) {
    throw new AppError('VALIDATION_ERROR', '没有可更新的字段');
  }
  const merged = { ...current, ...payload };
  await checkText(textForCheck(merged), openId);
  payload.searchKeywords = buildKeywords(merged);
  payload.moderationResult = { text: 'pass', checkedAt: new Date() };
  payload.updatedAt = new Date();

  if (event.contact) {
    const contact = contactPayload(event);
    if (!current.contactId) {
      throw new AppError('CONTACT_NOT_FOUND', '联系方式记录不存在');
    }
    await contacts.doc(current.contactId).update({
      data: {
        contactType: contact.contactType,
        contactValueEncrypted: encryptContact(contact.contactValue),
        isVisible: true,
        updatedAt: new Date()
      }
    });
  }
  await books.doc(bookId).update({ data: payload });
  const updated = await books.doc(bookId).get();
  return ownerBook(updated.data);
}

async function changeStatus(event, openId) {
  await assertActiveUser(openId);
  const bookId = stringValue(event.bookId, 'bookId', 1, 128);
  const status = stringValue(event.status, '状态', 1, 32);
  if (!['published', 'sold', 'offline'].includes(status)) {
    throw new AppError('VALIDATION_ERROR', '状态无效');
  }
  const current = await getOwnedBook(bookId, openId);
  if (current.status === 'rejected') {
    throw new AppError('BOOK_NOT_EDITABLE', '已拒绝书籍不可直接改状态');
  }
  const now = new Date();
  const data = { status, updatedAt: now };
  if (status === 'published') data.publishedAt = now;
  await books.doc(bookId).update({ data });
  if (current.contactId) {
    await contacts.doc(current.contactId).update({
      data: { isVisible: status === 'published', updatedAt: now }
    });
  }
  const updated = await books.doc(bookId).get();
  return ownerBook(updated.data);
}

async function myBooks(event, openId) {
  await assertActiveUser(openId);
  const size = pageSize(event.pageSize);
  const condition = { sellerOpenId: openId, deletedAt: null };
  if (event.status) {
    const status = stringValue(event.status, '状态', 1, 32);
    if (!['pending_review', 'published', 'sold', 'offline', 'rejected'].includes(status)) {
      throw new AppError('VALIDATION_ERROR', '状态无效');
    }
    condition.status = status;
  }
  const page = await queryPage(condition, event.cursor, size, 'createdAt');
  return {
    items: page.rows.map(ownerBook),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore
  };
}

const actions = { list, detail, search, publish, update, changeStatus, myBooks };

exports.main = async (event = {}) => {
  const id = requestId();
  try {
    const action = typeof event.action === 'string' ? event.action : '';
    if (!actions[action]) {
      throw new AppError('INVALID_ACTION', '不支持的操作');
    }
    const context = cloud.getWXContext();
    const openId = context && context.OPENID;
    if (!openId) {
      throw new AppError('UNAUTHORIZED', '无法识别当前用户');
    }
    const data = await actions[action](event, openId);
    return { success: true, data, requestId: id };
  } catch (error) {
    const known = error instanceof AppError;
    return {
      success: false,
      error: {
        code: known ? error.code : 'INTERNAL_ERROR',
        message: known ? error.message : '服务暂时不可用'
      },
      requestId: id
    };
  }
};
