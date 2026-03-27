{
  "mcpServers": {
    "github-enterprise": {
      "type": "streamable-http",
      "url": "http://localhost:3000/sse",
      "alwaysAllow": ["*"],           // ← 这行最关键，允许所有工具
      "timeout": 60000,
      "disabled": false
    }
  }
}


export GITHUB_TOKEN="ghp_你的token"
export GITHUB_ENTERPRISE_URL="https://github.your-company.com/api/v3"
export DEBUG=true          # 可选，开启调试
export LANGUAGE=en         # 或 ko（韩语）
启动服务器：
Bashnpm run dev


请使用 github-enterprise 的 get_repository 工具，获取仓库 owner/repo 的详细信息
