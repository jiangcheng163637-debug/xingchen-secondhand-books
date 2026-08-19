var bookService = require('../../services/book');
var constants = require('../../config/constants');
var errors = require('../../utils/error-map');

Page({
  data:{ categories:constants.categories, activeCategory:'全部', school:constants.schools[0], books:[], loading:true, error:'', hasMore:true, cursor:0 },
  onLoad:function () {
    var self=this;
    var app=getApp();
    this.setData({school:app.globalData.school || constants.schools[0]});
    this.load(true);
    if(app.globalData.userReady)app.globalData.userReady.then(function(){self.syncSchool(true);});
  },
  onShow:function () { if(this.loadedOnce)this.syncSchool(true); this.loadedOnce=true; },
  syncSchool:function (reload) {
    var school=getApp().globalData.school || constants.schools[0];
    var changed=!this.data.school || this.data.school.id!==school.id || this.data.school.campusId!==school.campusId || this.data.school.campusName!==school.campusName;
    if(changed){this.setData({school:school});if(reload)this.load(true);}
  },
  onPullDownRefresh:function () { this.load(true).then(function(){wx.stopPullDownRefresh();}); },
  onReachBottom:function () { if (!this.data.loading && this.data.hasMore) this.load(false); },
  load:function (reset) {
    var self = this;
    if (reset) this.setData({ loading:true, error:'', cursor:0, hasMore:true }); else this.setData({ loading:true });
    return bookService.list({ category:this.data.activeCategory, schoolId:this.data.school && this.data.school.id, campusId:this.data.school && this.data.school.campusId, cursor:reset ? 0 : this.data.cursor }).then(function (result) {
      self.setData({ books:reset ? result.items : self.data.books.concat(result.items), cursor:result.nextCursor, hasMore:result.hasMore, loading:false, error:'' });
    }).catch(function (error) { self.setData({ loading:false, error:errors.friendly(error) }); });
  },
  selectCategory:function (event) { this.setData({ activeCategory:event.currentTarget.dataset.value }); this.load(true); },
  openSearch:function () { wx.navigateTo({ url:'/pages/search/search' }); },
  openBook:function (event) { wx.navigateTo({ url:'/pages/detail/detail?id=' + event.detail.id }); },
  retry:function () { this.load(true); },
  publish:function () { wx.switchTab({ url:'/pages/publish/publish' }); }
});
