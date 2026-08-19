var cloud = require('../utils/cloud');
var constants = require('../config/constants');

function decorate(user) {
  user = user || {};
  var school = user.school;
  if (!school || !school.name) {
    var legacy = constants.schools.filter(function (item) { return item.id === user.schoolId; })[0];
    school = {
      id:user.schoolId || (legacy && legacy.id) || '',
      name:user.schoolName || (legacy && legacy.name) || '请选择学校',
      campusId:user.campusId || (legacy && legacy.campusId) || '',
      campusName:user.campusName || (legacy && legacy.campusName) || '请选择校区',
      provinceId:user.provinceId || '',
      provinceName:user.provinceName || '',
      city:user.schoolCity || user.city || ''
    };
  }
  return Object.assign({}, user, {
    avatar:user.avatar || user.avatarFileId || '',
    school:school,
    nickname:user.nickname || '星辰同学'
  });
}
function payload(data) {
  data = data || {};
  var result = {};
  if (data.nickname !== undefined) result.nickname = data.nickname;
  if (data.avatar !== undefined || data.avatarFileId !== undefined) result.avatarFileId = data.avatar || data.avatarFileId || '';
  if (data.school) {
    result.schoolId = data.school.id;
    result.schoolName = data.school.name || '';
    result.campusId = data.school.campusId || '';
    result.campusName = data.school.campusName || '';
    result.provinceId = data.school.provinceId || '';
    result.provinceName = data.school.provinceName || '';
    result.schoolCity = data.school.city || '';
  } else {
    if (data.schoolId !== undefined) result.schoolId = data.schoolId;
    if (data.campusId !== undefined) result.campusId = data.campusId;
  }
  return result;
}
module.exports = {
  init:function () { return cloud.call('user', 'init').then(decorate); },
  getProfile:function () { return cloud.call('user', 'getProfile').then(decorate); },
  updateProfile:function (data) {
    data = Object.assign({}, data || {});
    var avatar = data.avatar;
    var needsUpload = avatar && String(avatar).indexOf('cloud://') !== 0 && String(avatar).indexOf('https://') !== 0;
    var ready = needsUpload ? cloud.uploadFiles([avatar]).then(function (items) { data.avatar = items[0]; return data; }) : Promise.resolve(data);
    return ready.then(function (value) { return cloud.call('user', 'updateProfile', payload(value)); }).then(decorate);
  },
  deleteAccount:function () { return cloud.call('user', 'deleteAccount'); }
};
