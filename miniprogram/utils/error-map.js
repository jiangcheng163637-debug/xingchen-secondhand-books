var messages = {
  VALIDATION_ERROR: '请检查填写内容',
  UNAUTHORIZED: '请先完善个人信息',
  BOOK_NOT_FOUND: '这本书不存在或已下架',
  BOOK_NOT_AVAILABLE: '这本书暂时无法联系',
  CONTENT_REJECTED: '内容未通过安全检查',
  CONTENT_CHECK_FAILED: '内容安全检查暂不可用，请稍后重试',
  USER_NOT_FOUND: '请先初始化个人资料',
  FORBIDDEN: '你没有权限执行此操作',
  CONTACT_NOT_AVAILABLE: '卖家联系方式当前不可用',
  RATE_LIMITED: '操作太频繁，请稍后再试',
  NETWORK_ERROR: '网络开小差了，请重试'
};
function friendly(error) {
  var code = error && (error.code || error.errCode);
  return messages[code] || (error && error.message) || messages.NETWORK_ERROR;
}
module.exports = { messages: messages, friendly: friendly };
