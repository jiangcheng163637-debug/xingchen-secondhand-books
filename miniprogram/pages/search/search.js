var bookService = require('../../services/book');
var debounce = require('../../utils/debounce');
var storage = require('../../utils/storage');
var errors = require('../../utils/error-map');

Page({
  data:{ keyword:'', history:[], results:[], searching:false, searched:false, error:'' },
  onLoad:function () { this.setData({ history:storage.get('search', []) }); this.runSearch = debounce(this.search.bind(this), 300); },
  onInput:function (event) { var keyword=event.detail.value; this.setData({keyword:keyword,error:''}); this.runSearch(keyword); },
  useHistory:function (event) { var keyword=event.currentTarget.dataset.value; this.setData({keyword:keyword}); this.search(keyword); },
  search:function (keyword) {
    keyword=String(keyword||'').trim();
    if (keyword.length < 2) { this.setData({results:[],searched:false,searching:false}); return; }
    var self=this; this.setData({searching:true,searched:true,error:''});
    bookService.search(keyword).then(function (items) { self.saveHistory(keyword); self.setData({results:items,searching:false}); }).catch(function(error){self.setData({searching:false,error:errors.friendly(error)});});
  },
  saveHistory:function(keyword){var items=storage.get('search',[]).filter(function(item){return item!==keyword;});items.unshift(keyword);items=items.slice(0,10);storage.set('search',items);this.setData({history:items});},
  clearHistory:function(){storage.remove('search');this.setData({history:[]});},
  cancel:function(){wx.navigateBack();},
  openBook:function(event){wx.navigateTo({url:'/pages/detail/detail?id='+event.detail.id});},
  retry:function(){this.search(this.data.keyword);}
});
