---
title: lca与树上（路径交、并，直径）问题
tags: [图论,树论,LCA,Tarjan,st表,数据结构,并查集,线段树,dfs,bfs]
categories: [笔记]
date: 2024-5-27
mathjax: true
---
最近的一些比赛中经常用到树上 $LCA$ 的常见模型，这里整理一下几种做法和应用场景。

<!--more-->

## LCA 常见求法

### 倍增 LCA

预处理复杂度为 $O(n\log n)$，单次查询复杂度为 $O(\log n)$。

基本思路是先用 BFS 或 DFS 预处理每个节点深度，并用倍增数组 $f[u][i]$ 表示节点 $u$ 向上跳 $2^i$ 步后的祖先。查询时先把两个点跳到同一深度，再从高位到低位一起向上跳，最终得到最近公共祖先。

### Tarjan 离线 LCA

总体复杂度为 $O(n+q)$，适合所有查询已知、可以离线处理的场景。

核心是 DFS 遍历树，并用并查集维护已经访问过的子树。当一个询问的另一个端点已经访问过时，就可以用并查集祖先得到答案。

### 欧拉序 + RMQ

预处理复杂度为 $O(n\log n)$，单次查询复杂度为 $O(1)$。

做法是 DFS 处理欧拉序，记录每个节点第一次出现的位置，并用 ST 表维护欧拉序区间内深度最小的节点。两个点的 LCA 就是它们第一次出现位置之间深度最小的节点。

### 树链剖分 LCA

预处理复杂度为 $O(n)$ 或 $O(n\log n)$，单次查询复杂度为 $O(\log n)$。

树链剖分更适合需要同时维护路径信息的题，比如路径修改、路径查询等。

## 常见模型

树上 $LCA$ 常见应用包括：

1. 动态维护树的直径。
2. 判断两条树上路径是否相交。
3. 统计树上路径的并。

这些模型的关键通常是把路径 $(u,v)$ 拆成 $u\to LCA(u,v)$ 和 $v\to LCA(u,v)$ 两段，再用深度、距离或 DFS 序进行判断。

### 倍增 LCA 代码

```cpp
int n,depth[N],f[N][19];
vector<int> e[N];
void bfs(int root){
    memset(depth,0x3f,sizeof depth);
    depth[0]=0,depth[root]=1;//0为st表的哨兵
    queue<int> q;
    q.push(root);
    while(q.size()){
        int ver=q.front();
        q.pop();
        for(auto &to:e[ver]){
            if(depth[to]>depth[ver]+1){
                depth[to]=depth[ver]+1;
                f[to][0]=ver;
                for(int i=1;i=0;i--){
        if(depth[f[a][i]]=0;i--){
        if(f[a][i]!=f[b][i])
        a=f[a][i],b=f[b][i];
    }
    return f[a][0];
}
```

### 欧拉序 RMQ 代码

```cpp
int n,q,root,depth[Ne[N];
void dfs(int u,int d,int fa){
    se[++tot]=u;
    id[u]=tot;
    depth[tot]=d;
    for (auto &to : e[u]){
        if(to==fa)continue;
        dfs(to,d+1,u);
        se[++tot]=u;
        depth[tot]=d;
    }
}
int lca(int l,int r){
    int k=Log[r-l+1];
    return depth[f[l][k]]>n>>q>>root;
    for(int i=1;i>u>>v;
        e[u].pb(v);
        e[v].pb(u);
    }
    dfs(root,1,0);
    Log[1]=0,Log[2]=1;
    for(int i=3;i>u>>v;
        int l=id[u],r=id[v];
        if(l>r)swap(l,r);
    }
}
```
