var seedBooks = require('./books');
var storage = require('../utils/storage');
var formatter = require('../utils/formatter');
var env = require('../config/env');
var constants = require('../config/constants');

var defaultUser = { nickname:'星辰同学', avatar:'', school:constants.schools[0], privacyAccepted:true };

function error(code, message) { var e = new Error(message || code); e.code = code; throw e; }
function delay(data) { return new Promise(function (resolve) { setTimeout(function () { resolve(data); }, 180); }); }
function localBooks() { return storage.get('books', []); }
function allBooks() { return localBooks().concat(seedBooks); }
function publicBook(item) {
  var copy = formatter.book(item);
  copy.sellerLetter = copy.seller && copy.seller.nickname ? copy.seller.nickname.slice(0, 1) : '书';
  delete copy.contactType;
  delete copy.contactValue;
  return copy;
}
function findBook(id) { return allBooks().filter(function (item) { return item.id === id; })[0]; }
function list(data) {
  data = data || {};
  var items = allBooks().filter(function (item) {
    return item.status === 'published' && (!data.category || data.category === '全部' || item.category === data.category);
  });
  var offset = Number(data.cursor || 0);
  var size = Number(data.pageSize || env.pageSize || 6);
  return delay({ items:items.slice(offset, offset + size).map(publicBook), nextCursor:offset + size, hasMore:offset + size < items.length });
}
function search(data) {
  var keyword = String(data.keyword || '').trim().toLowerCase();
  if (!keyword) return delay([]);
  return delay(allBooks().filter(function (item) {
    var text = [item.title, item.author, item.publisher, item.isbn, item.category].join(' ').toLowerCase();
    return item.status === 'published' && text.indexOf(keyword) > -1;
  }).map(publicBook));
}
function detail(data) {
  var item = findBook(data.bookId || data.id);
  if (!item) error('BOOK_NOT_FOUND');
  var result = publicBook(item);
  result.isFavorite = storage.get('favorites', []).indexOf(item.id) > -1;
  return delay(result);
}
function publish(data) {
  var books = localBooks();
  if (data.imageFileIds && !data.images) data.images = data.imageFileIds;
  if (data.contact && !data.contactValue) { data.contactType = data.contact.type; data.contactValue = data.contact.value; }
  var id = 'local-' + Date.now();
  var selectedSchool = data.school || constants.schools.filter(function (item) { return item.id === data.schoolId; })[0] || constants.schools[0];
  var book = Object.assign({}, data, {
    id:id, status:'published', owner:true, createdAt:new Date().toISOString(),
    schoolName:data.schoolName || selectedSchool.name, campusName:data.campusName || selectedSchool.campusName,
    school:data.schoolName || selectedSchool.name, campus:data.campusName || selectedSchool.campusName,
    provinceId:data.provinceId || selectedSchool.provinceId || '', provinceName:data.provinceName || selectedSchool.provinceName || '', schoolCity:data.schoolCity || selectedSchool.city || '',
    seller:{ nickname:storage.get('user', defaultUser).nickname, avatar:storage.get('user', defaultUser).avatar || '' },
    cover:data.images[0] || '', coverTone:'#E8D9C3', viewCount:0, favoriteCount:0
  });
  delete book.contactValue;
  delete book.contactType;
  book.price = book.salePrice;
  books.unshift(book);
  storage.set('books', books);
  var contacts = storage.get('contacts', {});
  contacts[id] = { type:data.contactType, value:data.contactValue };
  storage.set('contacts', contacts);
  return delay(publicBook(book));
}
function myBooks() { return delay(localBooks().map(publicBook)); }
function changeStatus(data) {
  var books = localBooks();
  var bookId = data.bookId || data.id;
  var found = false;
  books = books.map(function (item) {
    if (item.id !== bookId) return item;
    found = true;
    return Object.assign({}, item, { status:data.status, updatedAt:new Date().toISOString() });
  });
  if (!found) error('BOOK_NOT_FOUND');
  storage.set('books', books);
  return delay({ id:bookId, status:data.status });
}
function toggleFavorite(data) {
  var ids = storage.get('favorites', []);
  var index = ids.indexOf(data.bookId);
  var active = index < 0;
  if (active) ids.unshift(data.bookId); else ids.splice(index, 1);
  storage.set('favorites', ids);
  return delay({ active:active });
}
function favoriteList() {
  var ids = storage.get('favorites', []);
  return delay(ids.map(findBook).filter(Boolean).map(publicBook));
}
function recordView(data) {
  var history = storage.get('history', []);
  history = history.filter(function (item) { return item.bookId !== data.bookId; });
  history.unshift({ bookId:data.bookId, viewedAt:new Date().toISOString() });
  storage.set('history', history.slice(0, 30));
  return delay({ recorded:true });
}
function history() {
  return delay(storage.get('history', []).map(function (record) {
    var item = findBook(record.bookId);
    if (!item) return null;
    var result = publicBook(item); result.viewedAt = record.viewedAt; return result;
  }).filter(Boolean));
}
function createIntent(data) {
  var items = storage.get('intentions', []);
  items.unshift({ bookId:data.bookId, sourceScene:data.sourceScene, createdAt:new Date().toISOString() });
  storage.set('intentions', items);
  return delay({ created:true });
}
function getContact(data) {
  var item = findBook(data.bookId);
  if (!item || item.status !== 'published') error('BOOK_NOT_AVAILABLE');
  var saved = storage.get('contacts', {})[data.bookId];
  return delay(saved || { type:'wechat', value:'xingchen_book_demo' });
}
function initUser() { return delay(storage.get('user', defaultUser)); }
function updateProfile(data) {
  var current = storage.get('user', defaultUser);
  var change = Object.assign({}, data);
  if (data.avatarFileId !== undefined) change.avatar = data.avatarFileId;
  if (data.schoolId !== undefined) change.school = {
    id:data.schoolId,
    name:data.schoolName || (current.school && current.school.name) || '请选择学校',
    campusId:data.campusId || '',
    campusName:data.campusName || '请选择校区',
    provinceId:data.provinceId || '',
    provinceName:data.provinceName || '',
    city:data.schoolCity || ''
  };
  var user = Object.assign({}, current, change);
  storage.set('user', user); return delay(user);
}
function submitFeedback(data) { var items = storage.get('feedback', []); items.unshift(Object.assign({ id:'f-'+Date.now(), createdAt:new Date().toISOString() }, data)); storage.set('feedback', items); return delay({ submitted:true }); }
function reportBook(data) { var items = storage.get('reports', []); items.unshift(Object.assign({ id:'r-'+Date.now(), createdAt:new Date().toISOString() }, data)); storage.set('reports', items); return delay({ submitted:true }); }

var actions = {
  book:{ list:list, search:search, detail:detail, publish:publish, myBooks:myBooks, changeStatus:changeStatus },
  engagement:{ toggleFavorite:toggleFavorite, favoriteList:favoriteList, recordView:recordView, history:history, historyList:history, createIntent:createIntent, getContact:getContact },
  user:{ init:initUser, getProfile:initUser, updateProfile:updateProfile, deleteAccount:function () { storage.remove('user'); return delay({ deleted:true }); } },
  moderation:{ submitFeedback:submitFeedback, reportBook:reportBook }
};
function call(domain, action, data) {
  if (!actions[domain] || !actions[domain][action]) error('NETWORK_ERROR', 'Mock action not found');
  return actions[domain][action](data || {});
}
module.exports = { call:call };
