---
title: 2016 USP-ICMC
tags: [贪心,DFS,BFS,STL]
categories: [补题]
date: 2024-3-22
mathjax: true
---
## Problem B - Martian Sunrise

### 题目描述

给定 $m$ 行音调，每行有 $7$ 个元素；再给定一行长度为 $n$ 的目标音调。每次可以从 $m$ 行中任选两行，作为当前可用的元素集合去匹配目标音调，求完成匹配所需的最少次数。

约束为 $1 \le m \le 16$，$1 \le n \le 10^4$。

<!--more-->

### 分析

可以先枚举所有“两行组合”。组合总数为：

$$
\frac{m(m-1)}{2}
$$

由于每行只有 $7$ 个元素，组合后的集合规模也不大。接着从目标音调的第一个元素开始向后扫描，并维护当前仍然可行的组合。

如果当前元素不在某个组合中，就把这个组合删掉；如果所有组合都不可行，说明必须重新选择一次组合，此时答案加一，并重新恢复所有组合。

贪心点在于：每次尽量选择能连续匹配更长前缀的组合，不会让最终次数变多。整体复杂度大约在 $3\times 10^7$ 级别，可以接受。

### 代码

```cpp
map mp;
int cnt;
set b[300];
bool st[300];
void solve()
{
    int m;
    cin >> m;
    vector v[m];
    for (int i = 0; i > s;
            if (!mp[s])
            mp[s] = ++cnt;
            v[i].pb(mp[s]);
        }
    }

    int n;
    cin >> n;
    vector a(n);
    for (auto &x : a)
    {
        string s;
        cin >> s;
        x = mp[s];
    }

    int idx = 0;
    if (m == 1)
    {
        for (auto &x : v[0])
            b[idx].insert(x);
        idx++;
    }

    for (int i = 0; i  s[N];
queue q;
bitset st;
void bfs(int u, int v)
    {
        int nn = u + h - 1, mm = v + w - 1;
        set::iterator it = s[v].lower_bound(u);
        // cout= u && t = v && z > n >> m >> h >> w >> Q;
    ans = n * m;
    for (int i = 1; i > x >> y;
        bfs(x, y);
        cout << ans << "\n";
    }
}
```
