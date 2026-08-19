function price(value) { return Number(value || 0).toFixed(2); }
function date(value) {
  var d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function relative(value) {
  var diff = Date.now() - new Date(value).getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
  return date(value);
}
function pad(value) { return value < 10 ? '0' + value : String(value); }
function status(value) {
  return { published:'在售', sold:'已售', offline:'已下架', pending_review:'审核中', rejected:'未通过' }[value] || value;
}
function book(item) {
  var copy = Object.assign({}, item);
  copy.priceText = price(item.salePrice);
  copy.dateText = relative(item.createdAt);
  copy.statusText = status(item.status);
  copy.coverLetter = String(item.title || '书').slice(0, 1);
  return copy;
}
module.exports = { price: price, date: date, relative: relative, status: status, book: book };
