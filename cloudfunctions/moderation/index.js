'use strict';

const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const users = db.collection('users');
const books = db.collection('books');
const contacts = db.collection('seller_contacts');
const reports = db.collection('reports');
const feedback = db.collection('feedback');

class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function requestId() {
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
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

function evidenceIds(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 9) {
    throw new AppError('VALIDATION_ERROR', '证据图片最多9张');
  }
  return value.map((item) => stringValue(item, '证据图片', 1, 512));
}

async function currentUser(openId) {
  const result = await users.where({ _openid: openId }).limit(1).get();
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
  const text = stringValue(content, '检测内容', 1, 5000);
  let result;
  try {
    result = await cloud.openapi.security.msgSecCheck({
      content: text,
      version: 2,
      scene: 2,
      openid: openId
    });
  } catch (error) {
    throw new AppError('CONTENT_CHECK_FAILED', '内容安全检测暂不可用');
  }

  const errCode = result && (result.errCode ?? result.errcode ?? 0);
  if (errCode !== 0 || !result || !result.result || !result.result.suggest) {
    throw new AppError('CONTENT_CHECK_FAILED', '内容安全检测暂不可用');
  }
  if (result.result.suggest !== 'pass') {
    throw new AppError('CONTENT_REJECTED', '提交内容未通过安全检测');
  }
  return {
    passed: true,
    suggestion: 'pass',
    label: result.result.label || null
  };
}

async function checkContent(event, openId) {
  await currentUser(openId);
  return checkText(event.content, openId);
}

async function enforceDailyLimit(collection, openId, field, limit) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await collection.where({
    [field]: openId,
    createdAt: _.gte(since)
  }).count();
  if (result.total >= limit) {
    throw new AppError('RATE_LIMITED', '提交过于频繁，请稍后再试');
  }
}

async function findBook(bookId) {
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

async function reportBook(event, openId) {
  await currentUser(openId);
  const bookId = stringValue(event.bookId, 'bookId', 1, 128);
  const reason = stringValue(event.reason, '举报原因', 2, 500);
  const evidenceFileIds = evidenceIds(event.evidenceFileIds);
  const book = await findBook(bookId);
  if (book.sellerOpenId === openId) {
    throw new AppError('INVALID_OPERATION', '不能举报自己的书籍');
  }
  await enforceDailyLimit(reports, openId, 'reporterOpenId', 10);
  await checkText(reason, openId);

  const duplicate = await reports.where({
    reporterOpenId: openId,
    targetType: 'book',
    targetId: bookId,
    status: _.in(['pending', 'reviewing'])
  }).limit(1).get();
  if (duplicate.data.length) {
    return { reportId: duplicate.data[0]._id, duplicated: true };
  }

  const result = await reports.add({
    data: {
      reporterOpenId: openId,
      targetType: 'book',
      targetId: bookId,
      reason,
      evidenceFileIds,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  });
  return { reportId: result._id, duplicated: false };
}

async function submitFeedback(event, openId) {
  await currentUser(openId);
  const content = stringValue(event.content, '反馈内容', 2, 2000);
  const contact = stringValue(event.contact, '联系方式', 0, 100, false);
  await enforceDailyLimit(feedback, openId, 'userOpenId', 10);
  await checkText([content, contact].filter(Boolean).join('\n'), openId);

  const result = await feedback.add({
    data: {
      userOpenId: openId,
      content,
      contact,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  });
  return { feedbackId: result._id };
}

async function reviewBook(event, openId) {
  const user = await currentUser(openId);
  if (user.role !== 'admin') {
    throw new AppError('FORBIDDEN', '仅管理员可执行审核');
  }
  const bookId = stringValue(event.bookId, 'bookId', 1, 128);
  const decision = stringValue(event.decision, '审核结果', 1, 32);
  if (!['published', 'rejected', 'offline', 'pending_review'].includes(decision)) {
    throw new AppError('VALIDATION_ERROR', '审核结果无效');
  }
  const note = stringValue(event.note, '审核备注', 0, 500, false);
  if (note) {
    await checkText(note, openId);
  }
  const book = await findBook(bookId);
  const now = new Date();
  const update = {
    status: decision,
    moderationResult: {
      decision,
      note,
      reviewedAt: now
    },
    updatedAt: now
  };
  if (decision === 'published') {
    update.publishedAt = now;
  }
  await books.doc(bookId).update({ data: update });
  if (book.contactId) {
    await contacts.doc(book.contactId).update({
      data: {
        isVisible: decision === 'published',
        updatedAt: now
      }
    }).catch(() => {});
  }
  return { bookId, status: decision };
}

const actions = { checkContent, reportBook, submitFeedback, reviewBook };

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
