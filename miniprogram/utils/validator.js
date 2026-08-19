function text(value, min, max) {
  var v = String(value || '').trim();
  return v.length >= min && v.length <= max;
}
function price(value) { return /^\d+(\.\d{1,2})?$/.test(String(value)) && Number(value) >= 0 && Number(value) <= 99999; }
function isbn(value) { return !value || /^(97[89])?\d{9}[\dXx]$/.test(String(value).replace(/[\s-]/g, '')); }
function contact(type, value) {
  var v = String(value || '').trim();
  if (type === 'phone') return /^1\d{10}$/.test(v);
  return /^[a-zA-Z][-_a-zA-Z0-9]{5,19}$/.test(v);
}
function validateBook(data) {
  if (!text(data.title, 1, 60)) return '请填写 1-60 字书名';
  if (!price(data.salePrice)) return '请填写正确售价';
  if (data.originalPrice && !price(data.originalPrice)) return '请填写正确原价';
  if (!isbn(data.isbn)) return 'ISBN 格式不正确';
  if (!data.images || !data.images.length) return '请至少添加一张书籍图片';
  if (!contact(data.contactType, data.contactValue)) return '请填写正确联系方式';
  if (!text(data.description || '', 0, 500)) return '描述不能超过 500 字';
  return '';
}
module.exports = { text: text, price: price, isbn: isbn, contact: contact, validateBook: validateBook };
