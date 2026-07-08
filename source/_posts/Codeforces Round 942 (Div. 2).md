---
title: Codeforces Round 942 (Div. 2)
tags: [扩展欧几里得]
categories: [补题]
date: 2024-4-3
mathjax: true
---
## D2. Reverse Card (Hard Version)

### 题意

给定两个正整数 $n,m$，计算满足条件的有序数对 $(a,b)$ 的数量：

<!--more-->

- $1 \le a \le n$，$1 \le b \le m$。
- $b\cdot \gcd(a,b)$ 是 $a+b$ 的倍数。

### 输入

每个测试包含多个测试用例。第一行包含测试用例数量 $t$，满足 $1 \le t \le 10^4$。

每个测试用例包含两个整数 $n,m$，满足 $1 \le n,m \le 2\cdot 10^6$。

所有测试用例中 $n$ 和 $m$ 的总和不超过 $2\cdot 10^6$。

### 输出

对每个测试用例输出一个整数，表示有效数对数量。

### 分析

设 $d=\gcd(a,b)$，并令：

$$
a=pd, \quad b=qd
$$

其中 $\gcd(p,q)=1$。原条件可以写成：

$$
b\cdot\gcd(a,b)=k(a+b)
$$

代入后得到：

$$
qd^2 = k(p+q)d
$$

也就是：

$$
qd = k(p+q)
$$

因为 $\gcd(p,q)=1$，所以 $\gcd(p+q,q)=1$，从而可以推出 $p+q$ 需要整除 $d$。

枚举互质的 $p,q$，它们对答案的贡献为：

$$
\left\lfloor \frac{\min(\lfloor n/p\rfloor,\lfloor m/q\rfloor)}{p+q} \right\rfloor
$$

因此可以枚举 $p\le \sqrt n$、$q\le \sqrt m$，并用 $\gcd(p,q)=1$ 判断是否有效。

### 代码

```cpp
void solve() {
    int n, m;
    cin >> n >> m;
    int ans = 0;
    for (int p = 1; p <= n / p; p++) {
        for (int q = 1; q <= m / q; q++) {
            if (__gcd(p, q) == 1) {
                ans += min(n / p, m / q) / (p + q);
            }
        }
    }
    cout << ans << "\n";
}
```
