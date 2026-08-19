Component({
  properties:{ book:{ type:Object, value:{}, observer:function () { this.setData({imageFailed:false}); } } },
  data:{ imageFailed:false },
  methods:{
    open:function () { this.triggerEvent('open', { id:this.data.book.id }); },
    imageError:function () { this.setData({imageFailed:true}); }
  }
});
