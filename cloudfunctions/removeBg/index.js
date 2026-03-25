// 云函数：AI抠图
const cloud = require('wx-server-sdk');
const https = require('https');
const http = require('http');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

/**
 * 使用免费AI抠图API
 * 这里使用 remove.bg 的免费API（需要注册获取API Key）
 * 你也可以替换为其他服务如：
 * - 百度AI人像分割：https://ai.baidu.com/tech/body/seg
 * - 腾讯云人脸识别：https://cloud.tencent.com/product/face
 */

// ========== 配置区 ==========
// 请替换为你自己的 API Key
// remove.bg 免费注册地址：https://www.remove.bg/api
const REMOVE_BG_API_KEY = '9dWkky7yzPP19PpHMD4qybvb';

// 或者使用百度AI（需要配置）
const USE_BAIDU_AI = false;
const BAIDU_API_KEY = 'YOUR_BAIDU_API_KEY';
const BAIDU_SECRET_KEY = 'YOUR_BAIDU_SECRET_KEY';
// =============================

exports.main = async (event, context) => {
  const { fileID, imagePath } = event;

  try {
    // 1. 获取图片数据
    let imageBuffer;
    if (fileID) {
      // 从云存储下载
      const downloadRes = await cloud.downloadFile({
        fileID: fileID
      });
      imageBuffer = downloadRes.fileContent;
    } else {
      return {
        success: false,
        error: '请提供 fileID 参数'
      };
    }

    // 2. 调用抠图API
    let resultBuffer;

    if (USE_BAIDU_AI) {
      resultBuffer = await removeBgWithBaidu(imageBuffer);
    } else {
      resultBuffer = await removeBgWithRemoveBg(imageBuffer);
    }

    // 3. 上传结果到云存储
    const resultFileID = await cloud.uploadFile({
      cloudPath: `idphoto/${Date.now()}_${Math.random().toString(36).slice(2)}.png`,
      fileContent: resultBuffer
    });

    return {
      success: true,
      fileID: resultFileID.fileID
    };

  } catch (error) {
    console.error('抠图失败:', error);
    return {
      success: false,
      error: error.message || '抠图失败'
    };
  }
};

/**
 * 使用 remove.bg API 抠图
 * 免费额度：每月50次
 */
async function removeBgWithRemoveBg(imageBuffer) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.remove.bg',
      port: 443,
      path: '/v1.0/removebg',
      method: 'POST',
      headers: {
        'X-Api-Key': REMOVE_BG_API_KEY,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (res.statusCode === 200) {
          resolve(buffer);
        } else {
          const errorMsg = buffer.toString();
          reject(new Error(`remove.bg API 错误: ${res.statusCode} - ${errorMsg}`));
        }
      });
    });

    req.on('error', reject);

    // 使用 base64 发送图片
    const postData = JSON.stringify({
      image_file_b64: imageBuffer.toString('base64'),
      size: 'auto'
    });

    req.write(postData);
    req.end();
  });
}

/**
 * 使用百度AI人像分割
 * 免费额度：每月1000次
 */
async function removeBgWithBaidu(imageBuffer) {
  // 1. 获取 access_token
  const tokenUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${BAIDU_API_KEY}&client_secret=${BAIDU_SECRET_KEY}`;

  const tokenRes = await new Promise((resolve, reject) => {
    https.get(tokenUrl, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });

  const accessToken = tokenRes.access_token;
  if (!accessToken) {
    throw new Error('获取百度AI access_token 失败');
  }

  // 2. 调用人像分割API
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      image: imageBuffer.toString('base64'),
      type: 'foreground' // 返回前景图
    });

    const options = {
      hostname: 'aip.baidubce.com',
      port: 443,
      path: `/rest/2.0/image-process/v1/body_seg?access_token=${accessToken}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const result = JSON.parse(buffer.toString());

        if (result.foreground) {
          // 返回前景图的 base64
          resolve(Buffer.from(result.foreground, 'base64'));
        } else {
          reject(new Error(result.error_msg || '百度AI抠图失败'));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}