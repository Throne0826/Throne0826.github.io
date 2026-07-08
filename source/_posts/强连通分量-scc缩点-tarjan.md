---
title: 强连通分量(scc缩点/tarjan)
tags: [dfs,强连通分量,tarjan,拓扑]
categories: [笔记]
date: 2024-6-10
mathjax: true
---
学习了一下强连通分量，这里整理 Tarjan 求 SCC 和缩点的基本思路。

<!--more-->

强连通分量指的是：在一个有向图中，任意两点之间都可以相互到达的最大点集。

缩点可以理解为“把环缩成点”。把每个强连通分量压成一个新点后，原图会变成一个 `DAG`（有向无环图），后续就可以在 DAG 上做拓扑、DP 等处理。

## Tarjan 求 SCC

Tarjan 求强连通分量的时间复杂度为：

$$
O(n+m)
$$

单纯判断是否有环一般可以用 DFS。在搜索过程中，一条边大致会遇到三种情况：

1. 指向一个还没有搜索过的点。
2. 指向一个搜索过的点，但这个点不是当前 DFS 链上的祖先。
3. 指向一个搜索过的点，并且这个点是当前 DFS 链上的祖先。

下图描述了这三种情况：黑色边为 `1`，绿色边为 `2`，蓝色边为 `3`。

<img src="https://lifexoryoung.cn/images/posts/scc-tarjan/dfs-edge-types.webp?v=202607071306" alt="DFS 过程中三类边的示意图">

只有第三类边会形成环。形成环的点属于同一个强连通分量，其余不能互相到达的点会各自成为单点强连通分量。以上图为例，强连通分量可以表示为 `{1}`、`{2, 3}`、`{4}`、`{5}`。

实际图中可能存在多个环互相嵌套，所以不能在第一次发现环时就立刻缩点。Tarjan 的做法是：

- 用 `dfn[u]` 记录节点 $u$ 第一次被访问的时间戳。
- 用 `low[u]` 记录节点 $u$ 能回到的最早时间戳。
- 用一个栈维护当前 DFS 链上的点。

当某个点满足 `dfn[u] == low[u]` 时，说明它是当前强连通分量中最早被访问的点。此时从栈顶不断弹出节点，直到弹出 `u`，这些点就构成一个完整的强连通分量。

### 模板

```cpp
int dfn[N], low[N], scc[N], sz[N];
int timer, scc_cnt;
stack<int> st;
vector<int> e[N];
bool in_stack[N];

void tarjan(int u) {
    dfn[u] = low[u] = ++timer;
    st.push(u);
    in_stack[u] = true;

    for (int v : e[u]) {
        if (!dfn[v]) {
            tarjan(v);
            low[u] = min(low[u], low[v]);
        } else if (in_stack[v]) {
            low[u] = min(low[u], dfn[v]);
        }
    }

    if (dfn[u] == low[u]) {
        ++scc_cnt;
        while (true) {
            int x = st.top();
            st.pop();
            in_stack[x] = false;
            scc[x] = scc_cnt;
            sz[scc_cnt]++;
            if (x == u) break;
        }
    }
}
```

## 例题：P3387【模板】缩点

### 题目描述

给定一个 $n$ 个点、$m$ 条边的有向图，每个点有一个权值。求一条路径，使路径经过的点权值之和最大。重复经过同一个点时，点权只计算一次。

### 输入格式

第一行两个正整数 $n,m$。

第二行 $n$ 个整数，其中第 $i$ 个数 $a_i$ 表示点 $i$ 的点权。

接下来 $m$ 行，每行两个整数 $u,v$，表示一条 $u\to v$ 的有向边。

### 输出格式

输出最大的点权之和。

### 思路

因为原图是有向图，可能存在环。路径可以多次经过边或点，因此同一个强连通分量中的所有点权都可以被取到。

先用 Tarjan 求 SCC，并把每个强连通分量缩成一个点。缩点后得到 DAG，新点权值为该 SCC 内所有点权之和。

问题就变成：在 DAG 上求点权最长路径。可以按拓扑序做 DP：

$$
dp[v]=\max(dp[v], dp[u]+w_v)
$$

最终答案就是所有 $dp$ 值的最大值。

### 缩点代码

```cpp
int dfn[N], low[N],cnt,sz[N],scc[N],sc,d[N],dp[N],ans,w[N];
stack<int> st;
vector<int> e[N], ex[N];
bool vis[N];
queue<int> q;
void tarjan(int u){
    dfn[u]=low[u]=++cnt;
    st.push(u),vis[u]=true;
    for (auto &to : e[u]){
        if(!dfn[to]){
            tarjan(to);
            low[u]=min(low[u],low[to]);
        }
        else if(vis[to]){
            low[u]=min(low[u],dfn[to]);
        }
    }
    if(dfn[u]==low[u]){
        sc++;
        while(st.top()!=u){
            sz[sc]+=w[st.top()];
            scc[st.top()]=sc;
            vis[st.top()]=0;
            st.pop();
        }
        sz[sc]+=w[st.top()];
        scc[st.top()]=sc;
        vis[st.top()]=0;
        st.pop();
    }
}
void topu(){
    for(int i=1;i>n>>m;
    for(int i=1;i>w[i];
    for(int i=1;i>u>>v;
        e[u].pb(v);
    }

    for(int i=1;ist;
vector<int> e[N], ex[N];
bool vis[N];
queue<int> q;
void tarjan(int u){
    dfn[u]=low[u]=++cnt;
    st.push(u),vis[u]=true;
    for (auto &to : e[u]){
        if(!dfn[to]){
            tarjan(to);
            low[u]=min(low[u],low[to]);
        }
        else if(vis[to]){
            low[u]=min(low[u],dfn[to]);
        }
    }
    if(dfn[u]==low[u]){
        sc++;
        while(st.top()!=u){
            scc[st.top()]=sc;
            vis[st.top()]=0;
            st.pop();
        }
        scc[st.top()]=sc;
        vis[st.top()]=0;
        st.pop();
    }
}
void solve(){
    int n;cin>>n;
    for(int i=1;i>x,x){
            e[i].pb(x);
        }
    }

    for(int i=1;i<=n;i++)
    if(!dfn[i])tarjan(i);

    int ans1=0,ans2=0;
    for(int i=1;i<=n;i++){
        int u=scc[i];
        for(auto &to:e[i]){
            int v=scc[to];
            if(u==v)continue;
            d[v]++,ud[u]++;
        }
    }
    for(int i=1;i<=sc;i++)
    {
        if(!d[i])ans1++;
        if(!ud[i])ans2++;
    }
    cout<<ans1<<"\n";
    if(sc==1)
    cout<<0<<"\n";
    else cout<<max(ans1,ans2)<<"\n";
}
```
