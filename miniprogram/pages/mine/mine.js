var userService=require('../../services/user');
var bookService=require('../../services/book');
var engagement=require('../../services/engagement');
var errors=require('../../utils/error-map');

Page({
 data:{user:null,stats:{publish:0,favorite:0,history:0},loading:true,error:''},
 onShow:function(){this.load();},
 load:function(){var self=this;this.setData({loading:true,error:''});Promise.all([userService.init(),bookService.myBooks(),engagement.favoriteList(),engagement.history()]).then(function(results){getApp().globalData.user=results[0];self.setData({user:results[0],stats:{publish:results[1].length,favorite:results[2].length,history:results[3].length},loading:false});}).catch(function(error){self.setData({loading:false,error:errors.friendly(error)});});},
 chooseAvatar:function(event){this.updateUser({avatar:event.detail.avatarUrl});},
 nicknameChange:function(event){var nickname=String(event.detail.value||'').trim();if(nickname)this.updateUser({nickname:nickname});},
 updateUser:function(data){var self=this;userService.updateProfile(data).then(function(user){getApp().globalData.user=user;self.setData({user:user});wx.showToast({title:'资料已更新',icon:'success'});}).catch(function(error){wx.showToast({title:errors.friendly(error),icon:'none'});});},
 go:function(event){wx.navigateTo({url:event.currentTarget.dataset.url});},
 retry:function(){this.load();}
});
