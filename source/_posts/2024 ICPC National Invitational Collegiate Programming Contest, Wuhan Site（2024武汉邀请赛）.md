---
title: 2024 ICPC National Invitational Collegiate Programming Contest, Wuhan Site（2024武汉邀请赛）
tags: [扩展欧几里得]
categories: [补题]
date: 2024-4-3
mathjax: true
---
## Problem B - Countless Me

### 分析

假设最优情况下，目标序列的每个值分别为：

$$
x_1,x_2,\cdots,x_n
$$

把原序列变成任意目标序列时，每个位置最多只需要一次操作，因此整体可以看作“构造一个更优的目标序列”。

<!--more-->

由于题目和位运算有关，可以从高位到低位贪心判断当前位是否可以保留。设当前所有值的总和为 $now$，每一位从高到低尝试加入答案。

如果当前位可以通过剩余总和分配出来，就保留这一位；否则跳过。这样可以保证高位优先最大化。

整体思路是：

1. 统计所有数的总和。
2. 从高位到低位枚举答案的每一位。
3. 判断当前剩余总和能否支持这一位的构造。
4. 如果可以，就把这一位加入答案，并扣掉对应消耗。

这种做法本质上是按位贪心，高位优先保证最终答案最大。

### 代码

```cpp
    for(int i=1;i>x;
        res+=x;
    }
    int ans=0;
    for(int i=30;i>=0;i--){
        int ver=((1llver)ans|=(1ll<<i),res-=min(n,res/(1ll<<i))*(1ll<<i);
    }
    cout<<ans<<"\n";
}
```
