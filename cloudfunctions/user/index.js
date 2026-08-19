'use strict';

const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const users = db.collection('users');

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

function requireString(value, field, min, max) {
  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_ERROR', `${field}格式不正确`);
  }
  const text = value.trim();
  if (text.length < min || text.length > max) {
    throw new AppError('VALIDATION_ERROR', `${field}长度应为${min}-${max}个字符`);
  }
  return text;
}

function optionalString(value, field, max) {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  return requireString(value, field, 1, max);
}

function validateIdentifier(value, field, required) {
  if (!required && (value === undefined || value === null || value === '')) {
    return '';
  }
  const text = requireString(value, field, 1, 64);
  if (!/^[A-Za-z0-9_:-]+$/.test(text)) {
    throw new AppError('VALIDATION_ERROR', `${field}包含非法字符`);
  }
  return text;
}

async function checkText(content, openId) {
  let result;
  try {
    result = await cloud.openapi.security.msgSecCheck({
      content,
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

async function findUser(openId) {
  const result = await users.where({ _openid: openId }).limit(1).get();
  return result.data[0] || null;
}

function assertActive(user) {
  if (!user) {
    throw new AppError('USER_NOT_FOUND', '用户尚未初始化');
  }
  if (user.status === 'blocked') {
    throw new AppError('FORBIDDEN', '账号当前不可用');
  }
  if (user.status === 'deleted') {
    throw new AppError('ACCOUNT_DELETED', '账号已注销');
  }
}

function publicProfile(user) {
  return {
    id: user._id,
    nickname: user.nickname || '',
    avatarFileId: user.avatarFileId || '',
    schoolId: user.schoolId || '',
    schoolName: user.schoolName || '',
    campusId: user.campusId || '',
    campusName: user.campusName || '',
    provinceId: user.provinceId || '',
    provinceName: user.provinceName || '',
    schoolCity: user.schoolCity || '',
    role: user.role === 'admin' ? 'admin' : 'user',
    status: user.status,
    privacyAcceptedAt: user.privacyAcceptedAt || null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

async function init(event, openId) {
  const existing = await findUser(openId);
  if (existing) {
    assertActive(existing);
    return publicProfile(existing);
  }

  const nickname = hasOwn(event, 'nickname')
    ? requireString(event.nickname, '昵称', 1, 32)
    : '微信用户';
  const avatarFileId = optionalString(event.avatarFileId, '头像', 512);
  const schoolId = validateIdentifier(event.schoolId, '学校', false);
  const schoolName = optionalString(event.schoolName, '学校名称', 100);
  const campusId = validateIdentifier(event.campusId, '校区', false);
  const campusName = optionalString(event.campusName, '校区名称', 40);
  const provinceId = validateIdentifier(event.provinceId, '省级区域', false);
  const provinceName = optionalString(event.provinceName, '省级区域名称', 32);
  const schoolCity = optionalString(event.schoolCity, '学校城市', 32);
  if (hasOwn(event, 'nickname')) {
    await checkText(nickname, openId);
  }

  const now = new Date();
  const result = await users.add({
    data: {
      _openid: openId,
      nickname,
      avatarFileId,
      schoolId,
      schoolName,
      campusId,
      campusName,
      provinceId,
      provinceName,
      schoolCity,
      role: 'user',
      status: 'active',
      privacyAcceptedAt: event.privacyAccepted === true ? now : null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    }
  });
  const created = await users.doc(result._id).get();
  return publicProfile(created.data);
}

async function getProfile(openId) {
  const user = await findUser(openId);
  assertActive(user);
  return publicProfile(user);
}

async function updateProfile(event, openId) {
  const user = await findUser(openId);
  assertActive(user);

  const update = {};
  if (hasOwn(event, 'nickname')) {
    update.nickname = requireString(event.nickname, '昵称', 1, 32);
    await checkText(update.nickname, openId);
  }
  if (hasOwn(event, 'avatarFileId')) {
    update.avatarFileId = optionalString(event.avatarFileId, '头像', 512);
  }
  if (hasOwn(event, 'schoolId')) {
    update.schoolId = validateIdentifier(event.schoolId, '学校', true);
  }
  if (hasOwn(event, 'schoolName')) {
    update.schoolName = requireString(event.schoolName, '学校名称', 1, 100);
  }
  if (hasOwn(event, 'campusId')) {
    update.campusId = validateIdentifier(event.campusId, '校区', false);
  }
  if (hasOwn(event, 'campusName')) {
    update.campusName = requireString(event.campusName, '校区名称', 1, 40);
  }
  if (hasOwn(event, 'provinceId')) {
    update.provinceId = validateIdentifier(event.provinceId, '省级区域', false);
  }
  if (hasOwn(event, 'provinceName')) {
    update.provinceName = optionalString(event.provinceName, '省级区域名称', 32);
  }
  if (hasOwn(event, 'schoolCity')) {
    update.schoolCity = optionalString(event.schoolCity, '学校城市', 32);
  }
  if (event.privacyAccepted === true && !user.privacyAcceptedAt) {
    update.privacyAcceptedAt = new Date();
  }
  if (Object.keys(update).length === 0) {
    throw new AppError('VALIDATION_ERROR', '没有可更新的字段');
  }

  update.updatedAt = new Date();
  await users.doc(user._id).update({ data: update });
  const updated = await users.doc(user._id).get();
  return publicProfile(updated.data);
}

async function deleteAccount(openId) {
  const user = await findUser(openId);
  assertActive(user);
  const now = new Date();

  await users.doc(user._id).update({
    data: {
      nickname: '',
      avatarFileId: '',
      schoolId: '',
      schoolName: '',
      campusId: '',
      campusName: '',
      provinceId: '',
      provinceName: '',
      schoolCity: '',
      status: 'deleted',
      updatedAt: now,
      deletedAt: now
    }
  });
  await db.collection('seller_contacts').where({ ownerOpenId: openId }).update({
    data: {
      contactValueEncrypted: '',
      isVisible: false,
      updatedAt: now
    }
  });
  await db.collection('books').where({
    sellerOpenId: openId,
    status: _.in(['pending_review', 'published'])
  }).update({
    data: {
      status: 'offline',
      updatedAt: now
    }
  });

  return { deleted: true };
}

const actions = {
  init,
  getProfile: (event, openId) => getProfile(openId),
  updateProfile,
  deleteAccount: (event, openId) => deleteAccount(openId)
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
