var env = require('../config/env');
var repository = require('../mock/repository');

function call(domain, action, data) {
  if (!env.enableCloud) {
    return Promise.resolve().then(function () { return repository.call(domain, action, data || {}); });
  }
  return wx.cloud.callFunction({ name: domain, data: Object.assign({ action: action }, data || {}) }).then(function (res) {
    var result = res.result || {};
    if (!result.success) {
      var detail = result.error || {};
      var error = new Error(detail.message || result.message || detail.code || result.code || 'NETWORK_ERROR');
      error.code = detail.code || result.code || 'NETWORK_ERROR';
      error.requestId = result.requestId || '';
      throw error;
    }
    return result.data;
  }).catch(function (error) {
    if (!error.code) error.code = 'NETWORK_ERROR';
    throw error;
  });
}
function uploadFiles(paths) {
  if (!env.enableCloud) return Promise.resolve(paths);
  return Promise.all(paths.map(function (path, index) {
    var ext = path.split('.').pop() || 'jpg';
    var cloudPath = 'books/' + Date.now() + '-' + index + '.' + ext;
    return wx.cloud.uploadFile({ cloudPath: cloudPath, filePath: path }).then(function (res) { return res.fileID; });
  }));
}
module.exports = { call: call, uploadFiles: uploadFiles };
