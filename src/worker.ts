interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/auth/github/login") {
      const state = crypto.randomUUID();
      const params = new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        scope: "repo read:user",
        state,
        redirect_uri: `${url.origin}/api/auth/github/callback`,
      });
      const githubUrl = `https://github.com/login/oauth/authorize?${params}`;
      return new Response(null, {
        status: 302,
        headers: {
          Location: githubUrl,
          "Set-Cookie": `github_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
        },
      });
    }

    if (url.pathname === "/api/auth/github/callback") {
      const code = url.searchParams.get("code");
      const stateParam = url.searchParams.get("state");
      if (!code) {
        return new Response("Missing code", { status: 400 });
      }

      const cookieHeader = request.headers.get("Cookie") ?? "";
      const cookieState = cookieHeader
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("github_oauth_state="))
        ?.split("=")[1];

      if (!stateParam || !cookieState || stateParam !== cookieState) {
        return new Response("Invalid state parameter", { status: 400 });
      }

      const tokenRes = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            code,
          }),
        },
      );

      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        error?: string;
      };

      if (!tokenData.access_token) {
        return new Response("Failed to get access token", { status: 400 });
      }

      const token = tokenData.access_token;
      const origin = url.origin;
      const html = `<!DOCTYPE html>
<html>
<head><title>GitHub Login</title></head>
<body>
<p>Login successful, you can close this window.</p>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'github-oauth-token', token: ${JSON.stringify(token)} }, ${JSON.stringify(origin)});
  }
  window.close();
</script>
</body>
</html>`;

      return new Response(html, {
        headers: { "Content-Type": "text/html" },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
