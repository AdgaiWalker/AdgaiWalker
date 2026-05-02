---
title: 代码与哲学：论抽象的本质
date: 2026-04-27
tags: [技术, 哲学]
type: article
published: true
concepts: [subtraction, human-sovereignty]
---

## 从柏拉图到面向对象

柏拉图说，现实世界是理念世界的投影。程序员说，对象是类的实例。

这两种说法惊人地相似。当我们写下 `class Dog` 的时候，我们在做什么？我们在定义一个"理念"——关于狗的本质属性和行为。而每一个 `new Dog()` 都是这个理念在内存中的一次"投影"。

## 抽象的代价

但抽象是有代价的。每一次抽象都在丢失信息，就像地图永远不会是领土本身。

```typescript
// 理念：完美的狗
interface PlatonicDog {
  bark(): string;
  fetch(item: unknown): Promise<unknown>;
}

// 现实：总有例外
class RealDog implements PlatonicDog {
  bark() {
    return Math.random() > 0.5 ? "woof" : "..."; // 有时候不想叫
  }
  async fetch(item: unknown) {
    if (Math.random() > 0.7) return null; // 有时候不想捡
    return item;
  }
}
```

也许好的代码和好的哲学一样：知道在哪里停止抽象，在哪里拥抱混沌。
