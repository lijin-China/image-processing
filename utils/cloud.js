/**
 * 云数据库操作封装
 * 用于朋友圈功能的数据存储和读取
 */

// 集合名称
const COLLECTION_POSTS = 'posts';
const COLLECTION_LIKES = 'likes';

// 获取数据库引用
function getDB() {
  return wx.cloud.database();
}

/**
 * 发布动态
 * @param {Object} data - 动态数据
 * @param {string} data.imageUrl - 图片云存储地址
 * @param {string} data.description - 描述文字
 * @param {Object} data.userInfo - 用户信息
 * @returns {Promise} 发布结果
 */
async function publishPost(data) {
  try {
    const db = getDB();
    const res = await db.collection(COLLECTION_POSTS).add({
      data: {
        imageUrl: data.imageUrl,
        description: data.description || '',
        userInfo: {
          nickName: data.userInfo?.nickName || '匿名用户',
          avatarUrl: data.userInfo?.avatarUrl || ''
        },
        likeCount: 0,
        createdAt: db.serverDate()
      }
    });
    return { success: true, id: res._id };
  } catch (e) {
    console.error('发布动态失败:', e);
    return { success: false, error: e };
  }
}

/**
 * 获取动态列表
 * @param {number} page - 页码，从0开始
 * @param {number} pageSize - 每页数量
 * @returns {Promise} 动态列表
 */
async function getPosts(page = 0, pageSize = 10) {
  try {
    const db = getDB();
    const skip = page * pageSize;
    const res = await db.collection(COLLECTION_POSTS)
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get();

    // 格式化时间
    const posts = res.data.map(post => ({
      ...post,
      formattedTime: formatTime(post.createdAt)
    }));

    return { success: true, posts, hasMore: res.data.length === pageSize };
  } catch (e) {
    console.error('获取动态列表失败:', e);
    return { success: false, posts: [], hasMore: false };
  }
}

/**
 * 点赞动态
 * @param {string} postId - 动态ID
 * @returns {Promise} 点赞结果
 */
async function likePost(postId) {
  try {
    const db = getDB();
    // 检查是否已点赞
    const checkRes = await db.collection(COLLECTION_LIKES)
      .where({
        postId: postId,
        _openid: '{openid}' // 云开发会自动替换
      })
      .count();

    if (checkRes.total > 0) {
      return { success: false, message: '已点赞' };
    }

    // 添加点赞记录
    await db.collection(COLLECTION_LIKES).add({
      data: {
        postId: postId,
        createdAt: db.serverDate()
      }
    });

    // 更新点赞数
    await db.collection(COLLECTION_POSTS)
      .doc(postId)
      .update({
        data: {
          likeCount: db.command.inc(1)
        }
      });

    return { success: true, liked: true };
  } catch (e) {
    console.error('点赞失败:', e);
    return { success: false, error: e };
  }
}

/**
 * 取消点赞
 * @param {string} postId - 动态ID
 * @returns {Promise} 取消结果
 */
async function unlikePost(postId) {
  try {
    const db = getDB();
    // 查找点赞记录
    const res = await db.collection(COLLECTION_LIKES)
      .where({
        postId: postId,
        _openid: '{openid}'
      })
      .get();

    if (res.data.length === 0) {
      return { success: false, message: '未点赞' };
    }

    // 删除点赞记录
    await db.collection(COLLECTION_LIKES)
      .doc(res.data[0]._id)
      .remove();

    // 更新点赞数
    await db.collection(COLLECTION_POSTS)
      .doc(postId)
      .update({
        data: {
          likeCount: db.command.inc(-1)
        }
      });

    return { success: true, liked: false };
  } catch (e) {
    console.error('取消点赞失败:', e);
    return { success: false, error: e };
  }
}

/**
 * 检查是否已点赞
 * @param {string} postId - 动态ID
 * @returns {Promise<boolean>} 是否已点赞
 */
async function checkLiked(postId) {
  try {
    const db = getDB();
    const res = await db.collection(COLLECTION_LIKES)
      .where({
        postId: postId,
        _openid: '{openid}'
      })
      .count();
    return res.total > 0;
  } catch (e) {
    console.error('检查点赞状态失败:', e);
    return false;
  }
}

/**
 * 批量检查点赞状态
 * @param {Array<string>} postIds - 动态ID数组
 * @returns {Promise<Object>} 点赞状态映射
 */
async function checkLikedBatch(postIds) {
  try {
    const db = getDB();
    const res = await db.collection(COLLECTION_LIKES)
      .where({
        postId: db.command.in(postIds),
        _openid: '{openid}'
      })
      .get();

    const likedSet = new Set(res.data.map(item => item.postId));
    return likedSet;
  } catch (e) {
    console.error('批量检查点赞状态失败:', e);
    return new Set();
  }
}

/**
 * 上传图片到云存储
 * @param {string} filePath - 本地文件路径
 * @returns {Promise<string>} 云存储地址
 */
async function uploadImage(filePath) {
  try {
    const cloudPath = `posts/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`;
    const res = await wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath
    });
    return res.fileID;
  } catch (e) {
    console.error('上传图片失败:', e);
    throw e;
  }
}

/**
 * 删除动态
 * @param {string} postId - 动态ID
 * @returns {Promise} 删除结果
 */
async function deletePost(postId) {
  try {
    const db = getDB();
    // 先获取动态信息以删除图片
    const postRes = await db.collection(COLLECTION_POSTS).doc(postId).get();
    if (postRes.data.imageUrl) {
      await wx.cloud.deleteFile({
        fileList: [postRes.data.imageUrl]
      });
    }

    // 删除相关点赞
    const likesRes = await db.collection(COLLECTION_LIKES)
      .where({ postId: postId })
      .get();
    for (const like of likesRes.data) {
      await db.collection(COLLECTION_LIKES).doc(like._id).remove();
    }

    // 删除动态
    await db.collection(COLLECTION_POSTS).doc(postId).remove();

    return { success: true };
  } catch (e) {
    console.error('删除动态失败:', e);
    return { success: false, error: e };
  }
}

/**
 * 格式化时间
 * @param {Date|string|number} date - 时间
 * @returns {string} 格式化后的时间字符串
 */
function formatTime(date) {
  if (!date) return '';

  const d = new Date(date);
  const now = new Date();
  const diff = now - d;

  // 1分钟内
  if (diff < 60000) {
    return '刚刚';
  }
  // 1小时内
  if (diff < 3600000) {
    return Math.floor(diff / 60000) + '分钟前';
  }
  // 今天内
  if (diff < 86400000 && d.getDate() === now.getDate()) {
    return Math.floor(diff / 3600000) + '小时前';
  }
  // 昨天
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.getDate() === yesterday.getDate()) {
    return '昨天 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  // 今年
  if (d.getFullYear() === now.getFullYear()) {
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  // 其他
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

function pad(n) {
  return String(n).padStart(2, '0');
}

module.exports = {
  publishPost,
  getPosts,
  likePost,
  unlikePost,
  checkLiked,
  checkLikedBatch,
  uploadImage,
  deletePost
};