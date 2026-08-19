var env = require('./config/env');
var userService = require('./services/user');

App({
  onLaunch: function () {
    if (env.enableCloud && wx.cloud) {
      wx.cloud.init({ env: env.cloudEnvId || undefined, traceUser: true });
    }
    var app=this;
    app.globalData.userReady=userService.init().then(function (user) {
      app.globalData.user=user;
      if(user.school&&user.school.id)app.globalData.school=user.school;
      return user;
    }).catch(function () { return null; });
  },
  globalData: {
    school: { id:'4111010001', name:'北京大学', campusId:'4111010001-1', campusName:'校本部', provinceId:'p01', provinceName:'北京市', city:'北京市' },
    user: null,
    userReady: null
  }
});
