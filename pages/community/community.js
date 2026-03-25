const { getPosts, likePost, unlikePost, uploadImage, publishPost, checkLikedBatch } = require('../../utils/cloud.js');

Page({
  data: {
    posts: [],
    page: 0,
    hasMore: true,
    loading: false,
    refreshing: false,
    showPublishModal: false,
    publishImage: '',
    publishDesc: '',
    uploading: false
  },

  onLoad() {
    this.loadPosts();
  },

  onPullDownRefresh() {
    this.refresh();
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore();
    }
  },

  // 加载动态列表
  async loadPosts() {
    if (this.data.loading) return;

    this.setData({ loading: true });

    try {
      const result = await getPosts(0, 10);

      if (result.success) {
        // 检查点赞状态
        const postIds = result.posts.map(p => p._id);
        const likedSet = await checkLikedBatch(postIds);

        const posts = result.posts.map(post => ({
          ...post,
          isLiked: likedSet.has(post._id)
        }));

        this.setData({
          posts,
          page: 0,
          hasMore: result.hasMore
        });
      } else {
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    } catch (e) {
      console.error('加载动态失败:', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },

  // 刷新
  async refresh() {
    this.setData({ refreshing: true, page: 0, hasMore: true });
    await this.loadPosts();
    this.setData({ refreshing: false });
  },

  // 加载更多
  async loadMore() {
    if (this.data.loading || !this.data.hasMore) return;

    this.setData({ loading: true });
    const nextPage = this.data.page + 1;

    try {
      const result = await getPosts(nextPage, 10);

      if (result.success) {
        // 检查点赞状态
        const postIds = result.posts.map(p => p._id);
        const likedSet = await checkLikedBatch(postIds);

        const newPosts = result.posts.map(post => ({
          ...post,
          isLiked: likedSet.has(post._id)
        }));

        this.setData({
          posts: [...this.data.posts, ...newPosts],
          page: nextPage,
          hasMore: result.hasMore
        });
      }
    } catch (e) {
      console.error('加载更多失败:', e);
    } finally {
      this.setData({ loading: false });
    }
  },

  // 预览图片
  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({
      urls: [url],
      current: url
    });
  },

  // 点赞/取消点赞
  async toggleLike(e) {
    const { id, liked } = e.currentTarget.dataset;
    const index = this.data.posts.findIndex(p => p._id === id);

    if (index === -1) return;

    const posts = [...this.data.posts];
    const post = posts[index];

    try {
      let result;
      if (liked) {
        result = await unlikePost(id);
      } else {
        result = await likePost(id);
      }

      if (result.success) {
        post.isLiked = result.liked;
        post.likeCount += result.liked ? 1 : -1;
        this.setData({ posts });
      }
    } catch (e) {
      console.error('点赞操作失败:', e);
    }
  },

  // 打开发布弹窗
  openPublishModal() {
    this.setData({ showPublishModal: true });
  },

  // 关闭发布弹窗
  closePublishModal() {
    this.setData({
      showPublishModal: false,
      publishImage: '',
      publishDesc: ''
    });
  },

  // 阻止事件冒泡（防止点击弹窗内容区域关闭弹窗）
  preventClose() {
    // 空函数，仅用于阻止事件冒泡
  },

  // 选择图片
  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({
          publishImage: res.tempFiles[0].tempFilePath
        });
      }
    });
  },

  // 输入描述
  onDescInput(e) {
    this.setData({ publishDesc: e.detail.value });
  },

  // 发布动态
  async doPublish() {
    if (!this.data.publishImage) {
      wx.showToast({ title: '请选择图片', icon: 'none' });
      return;
    }

    this.setData({ uploading: true });

    try {
      // 上传图片
      const imageUrl = await uploadImage(this.data.publishImage);

      // 获取用户信息
      let userInfo = {};
      try {
        const userRes = await wx.getUserProfile({
          desc: '用于发布动态显示昵称和头像'
        });
        userInfo = userRes.userInfo;
      } catch (e) {
        // 用户拒绝授权，使用默认值
        userInfo = { nickName: '用户', avatarUrl: '' };
      }

      // 发布到数据库
      const result = await publishPost({
        imageUrl,
        description: this.data.publishDesc,
        userInfo
      });

      if (result.success) {
        wx.showToast({ title: '发布成功', icon: 'success' });
        this.closePublishModal();
        this.refresh();
      } else {
        wx.showToast({ title: '发布失败', icon: 'none' });
      }
    } catch (e) {
      console.error('发布失败:', e);
      wx.showToast({ title: '发布失败', icon: 'none' });
    } finally {
      this.setData({ uploading: false });
    }
  },

  // 分享
  onShareAppMessage() {
    return {
      title: '图像工具箱 - 朋友圈',
      path: '/pages/community/community'
    };
  }
});