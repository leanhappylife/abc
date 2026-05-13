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


<properties>
    <java.version>17</java.version>
    <revision>DEV-SNAPSHOT</revision>
    <spring-security.version>6.3.9</spring-security.version>
    <common-lib.version>2.0.0</common-lib.version>
    ...
</properties>


export GITHUB_TOKEN="ghp_你的token"
export GITHUB_ENTERPRISE_URL="https://github.your-company.com/api/v3"
export DEBUG=true          # 可选，开启调试
export LANGUAGE=en         # 或 ko（韩语）
启动服务器：
Bashnpm run dev


<properties>
    <java.version>17</java.version>
    <revision>DEV-SNAPSHOT</revision>
    <spring-security.version>6.3.9</spring-security.version>
    <common-lib.version>2.0.0</common-lib.version>
    ...
</properties>





<properties>
    <java.version>17</java.version>
    <revision>DEV-SNAPSHOT</revision>
    <spring-security.version>6.3.9</spring-security.version>
    <common-lib.version>2.0.0</common-lib.version>
    ...
</properties>



mvn -U -pl :cmt-common-entitlement-ikurus-common-client -am dependency:tree "-Dincludes=org.springframework.security:spring-security-crypto" "-Dverbose"
请使用 github-enterprise 的 get_repository 工具，获取仓库 owner/repo 的详细信息
