import http from 'node:http';

export function requestLocal(
  port: number,
  path: string,
  headers: Record<string, string> = {},
  method: 'GET' | 'HEAD' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: string,
): Promise<{
  status: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
}> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          host: `127.0.0.1:${String(port)}`,
          ...(body === undefined
            ? {}
            : {
                'content-type': 'application/json',
                'content-length': String(Buffer.byteLength(body)),
              }),
          ...headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            headers: response.headers,
          });
        });
      },
    );
    request.on('error', reject);
    if (body === undefined) {
      request.end();
    } else {
      request.end(body);
    }
  });
}
