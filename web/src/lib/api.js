const DEFAULT_ERROR_MESSAGE = '网络错误，请检查服务是否正常';

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

// 统一的接口调用封装：自动带 Cookie、统一解析 JSON、统一把后端 error 字段抛成异常
async function request(path, { method = 'GET', body } = {}) {
  let response;

  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(DEFAULT_ERROR_MESSAGE, 0, null);
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError((data && data.error) || DEFAULT_ERROR_MESSAGE, response.status, data);
  }

  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
};

export { ApiError };
