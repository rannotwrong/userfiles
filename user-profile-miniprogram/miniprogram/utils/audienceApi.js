const api = require("./api");

function listAudienceUsers(params = {}) {
  const query = [];
  if (params.tier) query.push(`tier=${encodeURIComponent(params.tier)}`);
  if (params.keyword) query.push(`keyword=${encodeURIComponent(params.keyword)}`);
  const suffix = query.length ? `?${query.join("&")}` : "";
  return api.request({
    url: `/api/audience-users${suffix}`
  });
}

function createAudienceUser(profile) {
  return api.request({
    url: "/api/audience-users",
    method: "POST",
    data: profile
  });
}

function updateAudienceUser(id, patch) {
  return api.request({
    url: `/api/audience-users/${id}`,
    method: "PATCH",
    data: patch
  });
}

function deleteAudienceUser(id) {
  return api.request({
    url: `/api/audience-users/${id}`,
    method: "DELETE"
  });
}

function deleteAccount() {
  return api.request({
    url: "/api/account",
    method: "DELETE",
    data: { confirmation: "DELETE" }
  });
}

module.exports = {
  listAudienceUsers,
  createAudienceUser,
  updateAudienceUser,
  deleteAudienceUser,
  deleteAccount
};
