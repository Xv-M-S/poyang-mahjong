# Poyang Mahjong

鄱阳麻将项目。

## 文档

- [微信小游戏技术方案](docs/technical-plan.md)
- [规则开发基线](docs/rules/poyang-rules-v1.md)
- [单局引擎开发说明](docs/round-engine.md)

## 当前开发进度

第一阶段已开始，仓库目前包含：

- 可独立运行的 TypeScript 规则引擎；
- 34 种牌面、136 张实体牌的标准牌墙模型；
- 标准胡、七对、十三幺结构检测；
- 第一批鄱阳牌型识别；
- “平胡不能单独胡牌”的规则测试；
- 实时对局共享协议和状态机骨架；
- 牌墙安全洗牌、发牌、摸牌/出牌和单局结算状态机。

## 本地运行

需要 Node.js 22.18 或更高版本。

~~~bash
npm test
~~~

只运行规则引擎测试：

~~~bash
npm run test:rules
~~~
