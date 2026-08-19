var bookService=require('../../services/book');
var engagement=require('../../services/engagement');
var errors=require('../../utils/error-map');
var image=require('../../utils/image');

Page({
  data:{id:'',book:null,loading:true,error:'',working:false,imageFailed:false},
  onLoad:function(options){this.setData({id:options.id||''});this.load();},
  load:function(){var self=this;this.setData({loading:true,error:''});bookService.detail(this.data.id).then(function(book){self.setData({book:book,loading:false});engagement.recordView(book.id).catch(function(){});}).catch(function(error){self.setData({loading:false,error:errors.friendly(error)});});},
  preview:function(event){var book=this.data.book;var urls=book.images&&book.images.length?book.images:(book.cover?[book.cover]:[]);if(urls.length)image.preview(event.currentTarget.dataset.src||urls[0],urls);},
  imageError:function(){this.setData({imageFailed:true});},
  toggleFavorite:function(){var self=this;if(this.data.working)return;this.setData({working:true});engagement.toggleFavorite(this.data.id).then(function(result){self.setData({'book.isFavorite':result.active,working:false});wx.showToast({title:result.active?'已收藏':'已取消',icon:'success'});}).catch(function(error){self.setData({working:false});wx.showToast({title:errors.friendly(error),icon:'none'});});},
  want:function(){var self=this;if(this.data.working)return;wx.showModal({title:'确认联系卖家？',content:'平台仅提供信息撮合。请注意保护隐私，建议当面验书后线下交易。',confirmText:'继续联系',success:function(res){if(res.confirm)self.revealContact();}});},
  revealContact:function(){var self=this;this.setData({working:true});engagement.createIntent(this.data.id,'detail').then(function(){return engagement.getContact(self.data.id);}).then(function(contact){self.setData({working:false});var label=contact.type==='phone'?'手机号':'微信号';wx.showModal({title:'卖家'+label,content:contact.value,confirmText:'复制',success:function(res){if(res.confirm)wx.setClipboardData({data:contact.value});}});}).catch(function(error){self.setData({working:false});wx.showToast({title:errors.friendly(error),icon:'none'});});},
  report:function(){wx.navigateTo({url:'/subpackages/support/pages/report/report?bookId='+this.data.id});},
  onShareAppMessage:function(){var book=this.data.book||{};return{title:'同校好书｜'+(book.title||'星辰二手书'),path:'/pages/detail/detail?id='+this.data.id+'&source=share'};}
});
