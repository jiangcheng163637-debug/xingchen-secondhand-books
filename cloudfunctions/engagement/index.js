'use strict';

const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const books = db.collection('books');
const favorites = db.collection('favorites');
const history = db.collection('history');
const intentions = db.collection('intentions');
const contactViews = db.collection('contact_views');
const contacts = db.collection('seller_contacts');
const users = db.collection('users');
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

function stringValue(value, field, min, max) {
  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_ERROR', `${field}格式不正确`);
  }
  const text = value.trim();
  if (text.length < min || text.length > max) {
    throw new AppError('VALIDATION_ERROR', `${field}长度应为${min}-${max}个字符`);
  }
  return text;
}

function pageSize(value) {
  if (value === undefined) return 20;
  const size = Number(value);
  if (!Number.isInteger(size) || size < 1 || size > MAX_PAGE_SIZE) {
    throw new AppError('VALIDATION_ERROR', `pageSize应为1-${MAX_PAGE_SIZE}的整数`);
  }
  return size;
}

function stableId(...parts) {
  return crypto.createHash('sha256').update(parts.join('\0')).digest('hex');
}

function encodeCursor(row, field) {
  const value = row[field] instanceof Date ? row[field] : new Date(row[field]);
  return Buffer.from(JSON.stringify({ value: value.toISOString(), id: row._id }), 'utf8').toString('base64');
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
    const value = new Date(parsed.value);
    if (!parsed.id || Number.isNaN(value.getTime())) throw new Error('invalid cursor');
    return { value, id: parsed.id };
  } catch (error) {
    throw new AppError('VALIDATION_ERROR', '游标无效');
  }
}

function publicBook(book) {
  return {
    id: book._id,
    schoolId: book.schoolId,
    campusId: book.campusId || '',
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
    publishedAt: book.publishedAt
  };
}

async function assertActiveUser(openId) {
  const result = await users.where({ _openid: openId }).limit(1).get();
  const user = result.data[0];
  if (!user || user.status === 'deleted') {
    throw new AppError('USER_NOT_FOUND', '请先初始化用户资料');
  }
  if (user.status === 'blocked') {
    throw new AppError('FORBIDDEN', '账号当前不可用');
  }
}

async function getBook(bookId) {
  let result;
  try {
    result = await books.doc(bookId).get();
  } catch (error) {
    throw new AppError('BOOK_NOT_FOUND', '书籍不存在');
  }
  if (!result.data || result.data.deletedAt) {
    throw new AppError('BOOK_NOT_FOUND', '书籍不存在');
  }
  return result.data;
}

async function getPublishedBook(bookId) {
  const book = await getBook(bookId);
  if (book.status !== 'published') {
    throw new AppError('BOOK_NOT_AVAILABLE', '书籍当前不可用');
  }
  return book;
}

async function toggleFavorite(event, openId) {
  await assertActiveUser(openId);
  const bookId = stringValue(event.bookId, 'bookId', 1, 128);
  await getPublishedBook(bookId);
  const id = stableId('favorite', openId, bookId);

  let exists = false;
  try {
    await favorites.doc(id).get();
    exists = true;
  } catch (error) {
    exists = false;
  }

  if (exists) {
    await favorites.doc(id).remove();
    await books.doc(bookId).update({ data: { favoriteCount: _.inc(-1) } }).catch(() => {});
    return { favorited: false };
  }

  await favorites.doc(id).set({
    data: {
      userOpenId: openId,
      bookId,
      createdAt: new Date()
    }
  });
  await books.doc(bookId).update({ data: { favoriteCount: _.inc(1) } }).catch(() => {});
  return { favorited: true };
}

async function favoriteList(event, openId) {
  await assertActiveUser(openId);
  const size = pageSize(event.pageSize);
  const cursor = decodeCursor(event.cursor);
  const conditions = [{ userOpenId: openId }];
  if (cursor) {
    conditions.push(_.or([
      { createdAt: _.lt(cursor.value) },
      { createdAt: _.eq(cursor.value), _id: _.lt(cursor.id) }
    ]));
  }
  const condition = conditions.length === 1 ? conditions[0] : _.and(conditions);
  const result = await favorites.where(condition)
    .orderBy('createdAt', 'desc')
    .orderBy('_id', 'desc')
    .limit(size + 1)
    .get();
  const hasMore = result.data.length > size;
  const rows = result.data.slice(0, size);
  const bookIds = rows.map((row) => row.bookId);
  let bookMap = new Map();
  if (bookIds.length) {
    const bookResult = await books.where({
      _id: _.in(bookIds),
      status: 'published',
      deletedAt: null
    }).get();
    bookMap = new Map(bookResult.data.map((book) => [book._id, book]));
  }
  const items = rows
    .filter((row) => bookMap.has(row.bookId))
    .map((row) => ({
      favoriteId: row._id,
      createdAt: row.createdAt,
      book: publicBook(bookMap.get(row.bookId))
    }));
  return {
    items,
    nextCursor: hasMore && rows.length ? encodeCursor(rows[rows.length - 1], 'createdAt') : null,
    hasMore
  };
}

async function historyList(event, openId) {
  await assertActiveUser(openId);
  const size = pageSize(event.pageSize);
  const cursor = decodeCursor(event.cursor);
  const conditions = [{ userOpenId: openId }];
  if (cursor) {
    conditions.push(_.or([
      { lastViewedAt: _.lt(cursor.value) },
      { lastViewedAt: _.eq(cursor.value), _id: _.lt(cursor.id) }
    ]));
  }
  const condition = conditions.length === 1 ? conditions[0] : _.and(conditions);
  const result = await history.where(condition)
    .orderBy('lastViewedAt', 'desc')
    .orderBy('_id', 'desc')
    .limit(size + 1)
    .get();
  const hasMore = result.data.length > size;
  const rows = result.data.slice(0, size);
  const bookIds = rows.map((row) => row.bookId);
  let bookMap = new Map();
  if (bookIds.length) {
    const bookResult = await books.where({
      _id: _.in(bookIds),
      status: 'published',
      deletedAt: null
    }).get();
    bookMap = new Map(bookResult.data.map((book) => [book._id, book]));
  }
  const items = rows
    .filter((row) => bookMap.has(row.bookId))
    .map((row) => ({
      historyId: row._id,
      lastViewedAt: row.lastViewedAt,
      viewCount: row.viewCount,
      book: publicBook(bookMap.get(row.bookId))
    }));
  return {
    items,
    nextCursor: hasMore && rows.length ? encodeCursor(rows[rows.length - 1], 'lastViewedAt') : null,
    hasMore
  };
}

async function recordView(event, openId) {
  await assertActiveUser(openId);
  const bookId = stringValue(event.bookId, 'bookId', 1, 128);
  await getPublishedBook(bookId);
  const id = stableId('history', openId, bookId);
  const now = new Date();
  let exists = false;
  try {
    await history.doc(id).get();
    exists = true;
  } catch (error) {
    exists = false;
  }
  if (exists) {
    await history.doc(id).update({
      data: { lastViewedAt: now, viewCount: _.inc(1) }
    });
  } else {
    await history.doc(id).set({
      data: {
        userOpenId: openId,
        bookId,
        lastViewedAt: now,
        viewCount: 1
      }
    });
  }
  return { recorded: true };
}

async function createIntent(event, openId) {
  await assertActiveUser(openId);
  const bookId = stringValue(event.bookId, 'bookId', 1, 128);
  const book = await getPublishedBook(bookId);
  if (book.sellerOpenId === openId) {
    throw new AppError('INVALID_OPERATION', '不能对自己的书籍创建购买意向');
  }
  const sourceScene = event.sourceScene === undefined
    ? ''
    : stringValue(event.sourceScene, '来源', 1, 64);
  const id = stableId('intention', openId, bookId);
  const now = new Date();
  let created = false;
  try {
    await intentions.doc(id).get();
    await intentions.doc(id).update({
      data: { sourceScene, status: 'created', updatedAt: now }
    });
  } catch (error) {
    await intentions.doc(id).set({
      data: {
        buyerOpenId: openId,
        sellerOpenId: book.sellerOpenId,
        bookId,
        sourceScene,
        status: 'created',
        createdAt: now,
        updatedAt: now
      }
    });
    created = true;
  }
  if (created) {
    await books.doc(bookId).update({ data: { intentionCount: _.inc(1) } }).catch(() => {});
  }
  return { intentionId: id, created };
}

function encryptionKey() {
  const secret = process.env.CONTACT_ENCRYPTION_KEY;
  if (!secret || secret.length < 16) {
    throw new AppError('CONTACT_CONFIG_ERROR', '联系方式解密配置缺失');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function decryptContact(value) {
  try {
    const [version, ivText, tagText, dataText] = String(value).split(':');
    if (version !== 'v1' || !ivText || !tagText || !dataText) throw new Error('invalid ciphertext');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataText, 'base64')),
      decipher.final()
    ]).toString('utf8');
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('CONTACT_DECRYPT_FAILED', '联系方式暂时不可用');
  }
}

async function enforceContactRateLimit(openId) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const result = await contactViews.where({
    viewerOpenId: openId,
    createdAt: _.gte(since)
  }).count();
  if (result.total >= 20) {
    throw new AppError('RATE_LIMITED', '查看联系方式过于频繁，请稍后再试');
  }
}

async function getContact(event, openId, id) {
  await assertActiveUser(openId);
  const bookId = stringValue(event.bookId, 'bookId', 1, 128);
  const book = await getPublishedBook(bookId);
  if (book.sellerOpenId === openId) {
    throw new AppError('INVALID_OPERATION', '无需查看自己的联系方式');
  }
  if (!book.contactId) {
    throw new AppError('CONTACT_NOT_FOUND', '卖家未提供联系方式');
  }
  await enforceContactRateLimit(openId);

  let result;
  try {
    result = await contacts.doc(book.contactId).get();
  } catch (error) {
    throw new AppError('CONTACT_NOT_FOUND', '联系方式不存在');
  }
  const contact = result.data;
  if (!contact || !contact.isVisible || contact.ownerOpenId !== book.sellerOpenId) {
    throw new AppError('CONTACT_NOT_AVAILABLE', '联系方式当前不可用');
  }
  const contactValue = decryptContact(contact.contactValueEncrypted);
  await contactViews.add({
    data: {
      viewerOpenId: openId,
      sellerOpenId: book.sellerOpenId,
      bookId,
      contactType: contact.contactType,
      requestId: id,
      createdAt: new Date()
    }
  });
  const intentionId = stableId('intention', openId, bookId);
  await intentions.doc(intentionId).update({
    data: { status: 'contacted', updatedAt: new Date() }
  }).catch(() => {});
  return { type: contact.contactType, value: contactValue };
}

const actions = {
  toggleFavorite,
  favoriteList,
  historyList,
  recordView,
  createIntent,
  getContact
};

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
    const data = await actions[action](event, openId, id);
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
