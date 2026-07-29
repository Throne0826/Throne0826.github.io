---
title: 新文章
date: 2026-07-09 16:13:57
mathjax: true
tags:
  - 
categories:
  - 
description: "介绍ClaudeScience以项目、会话和工作区组织科研任务，由协调代理规划授权、委派专家，结合本地代码与外部数据库完成分析，生成可追溯成果，并由审查器核验结论与证据。"
---

# ClaudeScience 笔记

它的核心组成包括：

- Claude 模型
- Agent 调度能力
- 本地代码执行环境
- 科学数据库/工具连接
- 远程算力连接
- 结果可追溯系统
- 权限与隐私控制

这是一个能够帮助科研人员完成整套工作流的系统。

## 第 2 步：产品外壳——Project / Session / Workspace

```text
Project
├── Sessions
├── Artifacts
├── Project instructions
├── Permissions
├── Connected folders / files
└── 可能还包括 memory / specialists / settings
```

其中，最核心的是 **Session**。

Session 是“执行任务的过程”，包括：

- 一次对话
- 一次分析链
- 一次任务执行记录
- 一个 Workspace

**Workspace** 是这条工作链对应的本地工作目录。

一个 **Project** 就是一个项目。一个项目中可以包含多个 Session，用于保存不同的对话、记录和推理链；每个 Session 都对应一个 Workspace，用于存放相关文件。

## 完整链路

### 第 1 步：Coordinating Agent 首先理解任务

总协调 Agent 会先判断任务包含哪些内容：

- 这是一个单细胞分析任务
- 需要读取本地数据
- 需要 Python 或 R 环境
- 可能需要使用 scanpy / Seurat
- 需要完成 QC、聚类、T 细胞筛选和差异分析
- 最后需要生成 Artifact，例如 UMAP 图、marker gene 表和分析报告

它可能会先给出一个 plan：

#### 计划

1. 读取 h5ad / mtx 数据
2. 检查 metadata 中的 treatment/control 分组
3. 执行 QC
4. 进行标准化和降维
5. 聚类并识别 T 细胞
6. 比较治疗组与对照组的 T 细胞状态
7. 生成 UMAP 图和 marker gene 表
8. 保存 artifact
9. 运行 reviewer，检查分析结论

然后，它会请求权限：

> 是否允许读取 `D:/lab/lung_cancer_scRNA/`？
>
> 是否允许在当前 Session Workspace 中写入分析文件？
>
> 是否允许运行 Python 代码？

这就是 coordinating agent 的调度过程。

---

### 第 2 步：Delegation 拆分任务

如果任务较为复杂，它可能会将任务拆分成多条 track：

- **Track A：** 数据读取和 QC
- **Track B：** 细胞类型注释
- **Track C：** 治疗组 vs 对照组差异分析
- **Track D：** 图表和报告生成

每条 track 负责不同的任务。

例如：

#### Track A

- 读取 h5ad
- 检查细胞数、基因数和线粒体比例
- 输出 QC summary

#### Track B

- 进行聚类
- 根据 marker gene 标注 T cell / B cell / myeloid
- 筛选出 T cell

#### Track C

- 对 T cell 进行 treatment vs control 比较
- 查找 exhausted T cell markers
- 输出差异基因表

#### Track D

- 生成 UMAP
- 生成 marker gene heatmap
- 撰写一段汇报说明

**Delegation 的价值在于：**

> 不再由一个人按顺序逐项完成，而是将任务拆分后并行处理。

---

### 第 3 步：Specialist Agents 介入

此时，coordinating agent 可能会调用一个：

> **single-cell specialist**

这个 specialist 并不是“另一个聊天机器人随便说说”，而是遵循单细胞分析 SOP 的领域专家。

它更倾向于按照以下流程开展分析：

1. 检查每个细胞的 gene count
2. 检查 mitochondrial percentage
3. 过滤低质量细胞
4. normalize
5. log transform
6. 查找 highly variable genes
7. PCA
8. neighbors
9. UMAP
10. Leiden clustering
11. marker gene annotation
12. treatment/control comparison

普通模型可能会遗漏其中的某些步骤。

**Specialist 的价值在于：**

> 让任务遵循领域规范，而不是临时发挥。

---

### 第 4 步：Tools / 本地执行开始工作

接下来进入实际执行阶段。

Claude Science 会在当前 Session 的 Workspace 中编写代码，例如：

```text
workspace/
├── load_data.py
├── qc_analysis.py
├── cluster_cells.py
├── tcell_analysis.py
├── figures/
│   ├── umap_treatment_control.png
│   └── tcell_markers_heatmap.png
└── outputs/
    ├── marker_genes.csv
    └── qc_summary.csv
```

然后，它会在本机 Python kernel 中运行：

```python
import scanpy as sc

adata = sc.read_h5ad("input/lung_cancer.h5ad")
sc.pp.filter_cells(adata, min_genes=200)
sc.pp.normalize_total(adata)
sc.pp.log1p(adata)
sc.pp.highly_variable_genes(adata)
sc.tl.pca(adata)
sc.pp.neighbors(adata)
sc.tl.umap(adata)
sc.tl.leiden(adata)
```

此时，它已经不再只是聊天，而是在实际执行代码。

---

## 第 5 步：如需查询外部知识，调用 Connector

例如，它需要确认 T 细胞的 marker gene：

- `CD3D`
- `CD3E`
- `TRAC`
- `PDCD1`
- `CTLA4`
- `LAG3`
- `HAVCR2`
- `GZMB`
- `IFNG`

它可能会调用公共数据库连接器，包括：

- UniProt
- Reactome
- OpenAlex / PubMed
- 其他生命科学数据库

用途包括：

- 确认 marker gene 的含义
- 补充 pathway 解释
- 查找 exhaustion marker 的文献依据

也就是说，将：

> **本地数据分析 + 外部知识查询**

结合起来。

---

## 第 6 步：生成 Artifacts

运行完成后，它不会只提示“分析完成”。

它还会保存以下正式结果对象：

1. **Artifact 1：** UMAP 图
2. **Artifact 2：** T cell marker gene 表
3. **Artifact 3：** QC summary 表
4. **Artifact 4：** 简短的分析报告

这些 artifact 与普通文件的区别在于：

- 可以直接查看
- 具有版本信息
- 能够追溯生成它们的代码
- 能够记录运行环境
- 能够查看执行日志
- 可以由 reviewer 检查

例如，UMAP 图的 provenance 中可能包含：

- 生成该图的用户请求
- 生成该图的 Python 代码
- 运行日志
- scanpy 版本
- 输入数据路径
- 生成时间
- reviewer 检查结果

---

## 第 7 步：Reviewer 检查

最后，由 reviewer 检查 Claude 得出的结论。

Claude 可能会写：

> 治疗组 T 细胞表现出更强的 exhaustion 特征，  
> `PDCD1`、`CTLA4`、`LAG3` 在治疗组中上调。

Reviewer 会检查：

- 代码是否确实执行了 `treatment vs control` 的比较？
- metadata 中是否确实包含 `treatment/control`？
- `PDCD1`、`CTLA4`、`LAG3` 是否确实上调？
- p 值和 logFC 是否支持这一结论？
- 图表是否对应正确的分组？
- 代码执行过程中是否出现错误？

如果发现问题，它可能会指出：

> **Warning：**
>
> 结论中称 `LAG3` 显著上调，但 `marker_genes.csv` 中的 `adjusted p-value = 0.12`，因此不应称其显著上调。

这时，Claude 应将结论修改为：

> `PDCD1` 和 `CTLA4` 在治疗组中显著上调；  
> `LAG3` 呈上调趋势，但未达到统计学显著性。

这就是 **reviewer** 的价值。

---

## 完整工作流

### 用户

> 帮我分析肺癌单细胞数据

↓

### Coordinating Agent

理解任务、制定计划并请求权限。

↓

### Delegation

如果任务较为复杂，它可能会将任务拆分为多条 track：

- 将上层交给它的任务拆分为可并发执行的子任务
- 例如，拆分为 QC、注释、差异分析和图表报告等多条任务线

↓

### Specialist Agent

↓

### Specialist Agents 介入

这时，Coordinating Agent 可能会调用一个 Specialist Agent。  
普通模型可能会遗漏部分步骤。

Specialist 的价值在于：

> 确保任务遵循领域规范执行，而不是临时发挥。

↓

### Tools / Runtime

在本地 workspace 中编写 Python / R 代码，并运行 scanpy / Seurat。

↓

### Connectors

必要时查询 marker gene、pathway 和文献数据库。

↓

### Artifacts

保存 UMAP 图、marker 表、QC 报告和分析报告。

↓

### Reviewer

检查文字结论是否有代码、表格、图表和执行日志的支持。

↓

### 用户

查看结果、要求修改图表，并继续追问。