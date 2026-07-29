---
title: 新文章
date: 2026-07-29 14:45:31
mathjax: true
tags:
  - 
categories:
  - 
---

# 新文章

基础知识：

```text
训练代码 / PyTorch / verl
          ↓
NCCL：多张 GPU 之间通信
          ↓
CUDA Runtime：让程序调用 GPU
          ↓
NVIDIA 驱动：操作系统控制 GPU
          ↓
GPU 硬件

Docker：把训练代码、PyTorch、CUDA Runtime、NCCL 等封装成运行环境
```
**cuda：** CUDA 是 NVIDIA 提供的一套 GPU 计算平台。它让 PyTorch、TensorFlow 等程序能够把矩阵运算交给 GPU。

**Doker：** Docker 可以理解为一个隔离的程序运行环境。
一个 Docker 镜像通常包含：
```cpp
Ubuntu
Python
PyTorch
CUDA Runtime
NCCL
verl
项目依赖
```
Docker 本身不能直接使用 GPU，还需要宿主机安装 NVIDIA Container Toolkit。

**NCCL：** NCCL 是 NVIDIA 的多 GPU 通信库，读作“Nickel”。

单张 GPU 训练不太需要 NCCL；多张 GPU 或多台服务器训练时，模型参数和梯度需要在 GPU 之间同步，这就是 NCCL 的工作。

常见通信操作：
```cpp
AllReduce：聚合所有 GPU 的梯度，再把结果发回所有 GPU
AllGather：收集每张 GPU 上的数据
ReduceScatter：先汇总，再把不同部分分给各 GPU
Broadcast：从一张 GPU 向其他 GPU广播数据
```
**DDP 训练时发生了什么**:
假设全局 Batch Size 为 128，4 张 GPU，每张卡处理 32 条数据：
rank 0：读取样本 0～31
rank 1：读取样本 32～63
rank 2：读取样本 64～95
rank 3：读取样本 96～127
每个 Rank 独立执行：
读取自己的数据
→ 前向传播
→ 计算自己的 Loss
→ 反向传播
→ 得到本卡梯度
反向传播过程中，DDP 会把梯度分成若干 Bucket。某个 Bucket 的梯度准备好后，立即触发 NCCL AllReduce：
GPU 0 梯度 ┐
GPU 1 梯度 ├→ 求和并除以 WORLD_SIZE → 每张 GPU 获得相同平均梯度
GPU 2 梯度 ┤
GPU 3 梯度 ┘
然后每个进程独立执行：
optimizer.step()
因为所有进程最终拥有相同梯度，所以模型参数继续保持一致。
DDP 会尽量让梯度通信和后续反向计算重叠，这也是它通常比手工同步更高效的原因。