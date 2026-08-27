const api = require("./api");

function listLiveRecords(params = {}) {
  const query = [];
  if (params.startDate) query.push(`startDate=${encodeURIComponent(params.startDate)}`);
  if (params.endDate) query.push(`endDate=${encodeURIComponent(params.endDate)}`);
  const suffix = query.length ? `?${query.join("&")}` : "";
  return api.request({
    url: `/api/live-records${suffix}`
  });
}

function recognizeLiveRecord({ text = "", imageBase64 = "" } = {}) {
  return api.request({
    url: "/api/live-records/ocr",
    method: "POST",
    data: {
      text,
      imageBase64
    }
  });
}

function saveLiveRecord(record) {
  return api.request({
    url: "/api/live-records",
    method: "POST",
    data: record
  });
}

function fileToBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: "base64",
      success(result) {
        resolve(result.data);
      },
      fail(error) {
        reject(new Error(error.errMsg || "读取图片失败"));
      }
    });
  });
}

async function recognizeImageFile(filePath, text = "") {
  const imageBase64 = await fileToBase64(filePath);
  return recognizeLiveRecord({
    text,
    imageBase64
  });
}

module.exports = {
  listLiveRecords,
  recognizeLiveRecord,
  saveLiveRecord,
  fileToBase64,
  recognizeImageFile
};
