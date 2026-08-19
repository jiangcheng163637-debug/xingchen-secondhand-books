var cloud = require('../utils/cloud');
var formatter = require('../utils/formatter');
var constants = require('../config/constants');

function schoolName(id) {
  var school = constants.schools.filter(function (item) { return item.id === id; })[0];
  return school ? school.name : (id || '本校');
}
function campusName(schoolId, campusId) {
  var school = constants.schools.filter(function (item) { return item.id === schoolId; })[0];
  if (school && (!campusId || school.campusId === campusId)) return school.campusName;
  return campusId || '';
}
function decorate(item) {
  item = item || {};
  var copy = formatter.book(item);
  copy.cover = item.cover || item.coverFileId || '';
  copy.images = item.images || item.imageFileIds || (copy.cover ? [copy.cover] : []);
  copy.school = item.schoolName || (typeof item.school === 'string' ? item.school : schoolName(item.schoolId));
  copy.campus = item.campusName || item.campus || campusName(item.schoolId, item.campusId);
  copy.seller = item.seller || { nickname:'同校书友', avatar:'' };
  copy.sellerLetter = copy.seller.nickname ? copy.seller.nickname.slice(0, 1) : '书';
  return copy;
}
function decorateList(items) { return (items || []).map(decorate); }

module.exports = {
  list: function (data) {
    var query = Object.assign({}, data || {});
    if (query.category === '全部') delete query.category;
    return cloud.call('book', 'list', query).then(function (result) {
      return { items:decorateList(result.items || []), nextCursor:result.nextCursor, hasMore:result.hasMore };
    });
  },
  detail: function (id) {
    return cloud.call('book', 'detail', { bookId:id }).then(decorate);
  },
  search: function (keyword) {
    return cloud.call('book', 'search', { keyword:keyword }).then(function (result) {
      return decorateList(result.items || result);
    });
  },
  publish: function (data) {
    var school = data.school || {};
    return cloud.call('book', 'publish', {
      schoolId:school.id || data.schoolId,
      schoolName:school.name || data.schoolName || '',
      campusId:school.campusId || data.campusId || '',
      campusName:school.campusName || data.campusName || '',
      provinceId:school.provinceId || data.provinceId || '',
      provinceName:school.provinceName || data.provinceName || '',
      schoolCity:school.city || data.schoolCity || '',
      category:data.category,
      isbn:data.isbn || '',
      title:data.title,
      courseName:data.courseName || '',
      author:data.author || '',
      publisher:data.publisher || '',
      originalPrice:data.originalPrice || '',
      salePrice:data.salePrice,
      condition:data.condition,
      imageFileIds:data.images || data.imageFileIds || [],
      description:data.description || '',
      contact:{ type:data.contactType, value:data.contactValue }
    }).then(decorate);
  },
  myBooks: function () {
    return cloud.call('book', 'myBooks').then(function (result) { return decorateList(result.items || result); });
  },
  changeStatus: function (id, status) {
    return cloud.call('book', 'changeStatus', { bookId:id, status:status }).then(decorate);
  },
  decorate:decorate
};
