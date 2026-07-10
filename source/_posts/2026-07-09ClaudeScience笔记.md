---
title: 新文章
date: 2026-07-09 16:13:57
mathjax: true
tags:
  - 
categories:
  - 
---

# ClaudeScience笔记

它的核心组成是：                                                                                                         
                                                                                                                           
  Claude 模型                                                                                                              
  + agent 调度能力                                                                                                         
  + 本地代码执行环境                                                                                                       
  + 科学数据库/工具连接                                                                                                    
  + 远程算力连接                                                                                                           
  + 结果可追溯系统                                                                                                         
  + 权限/隐私控制   
一个能帮科研人员完成一整条工作流的系统。

第 2 步：产品壳，Project / Session / Workspace第 2 步：产品壳，Project / Session / Workspace

Project                                                                                                             
  ├── Sessions                                                                                                             
  ├── Artifacts                                                                                                            
  ├── Project instructions                                                                                                 
  ├── Permissions                                                                                                          
  ├── Connected folders / files                                                                                            
  └── 可能还有 memory / specialists / settings   

其中最核心的是session：
Session 是“干活的过程”                                                                                                                                                                                                                              
  一次对话                                                                                                                 
  一次分析链                                                                                                               
  一次任务执行记录                                                                                                         
  一次 workspace    
Workspace = 这条工作链的本地工作目录。

  一个project就是一个项目  ，一个项目中会有很多 session（对话和记录/推理链），一个 session中对应有一个workspace（存放）


完整链路合起来是这样                                                                                                     
     第 1 步：Coordinating Agent 先理解任务                                                                                   
                                                                                                                           
  总协调 agent 会先判断这个任务包含什么：                                                                                  
                                                                                                                           
  这是单细胞分析任务
  需要读本地数据                                                                                                           
  需要 Python 或 R 环境                                                                                                    
  可能要用 scanpy / Seurat                                                                                                 
  需要做 QC、聚类、T 细胞筛选、差异分析                                                                                    
  最后要生成 artifact：UMAP 图、marker gene 表、分析报告                                                                   
                                                                                                                           
  它可能先给一个 plan：                                                                                                    
                                                                                                                           
  计划：                                                                                                                   
  1. 读取 h5ad / mtx 数据                                                                                                  
  2. 检查 metadata 里 treatment/control 分组                                                                               
  3. 做 QC                                                                                                                 
  4. 标准化和降维                                                                                                          
  5. 聚类并识别 T 细胞                                                                                                     
  6. 比较治疗组和对照组 T 细胞状态                                                                                         
  7. 生成 UMAP 图和 marker gene 表                                                                                         
  8. 保存 artifact                                                                                                         
  9. 运行 reviewer 检查结论                                                                                                
                                                                                                                           
  然后它会问权限：                                                                                                         
                                                                                                                           
  是否允许读取 D:/lab/lung_cancer_scRNA/？                                                                                 
  是否允许在本 session workspace 中写入分析文件？                                                                          
  是否允许运行 Python 代码？                                                                                               
                                                                                                                           
  这就是 coordinating agent 在调度。                                                                                       
                                                                                                                           
  ———                                                                                                                      
                                                                                                                           
  第 2 步：Delegation 拆任务                                                                                               
                                                                                                                           
  如果任务复杂，它可能把任务拆成几条 track：                                                                               
                                                                                                                           
  Track A：数据读取和 QC
  Track B：细胞类型注释                                                                                                    
  Track C：治疗组 vs 对照组差异分析                                                                                        
  Track D：图表和报告生成                                                                                                  
                                                                                                                           
  每条 track 做不同事情。                                                                                                  
                                                                                                                           
  比如：                                                                                                                   
                                                                                                                           
  Track A：                                                                                                                
  - 读 h5ad                                                                                                                
  - 检查细胞数、基因数、线粒体比例                                                                                         
  - 输出 QC summary                                                                                                        
                                                                                                                           
  Track B：                                                                                                                
  - 聚类                                                                                                                   
  - 根据 marker gene 标注 T cell / B cell / myeloid                                                                        
  - 筛出 T cell                                                                                                            
                                                                                                                           
  Track C：                                                                                                                
  - 对 T cell 做 treatment vs control 比较                                                                                 
  - 找 exhausted T cell markers                                                                                            
  - 输出差异基因表                                                                                                         
                                                                                                                           
  Track D：                                                                                                                
  - 生成 UMAP                                                                                                              
  - 生成 marker gene heatmap                                                                                               
  - 写一段汇报解释                                                                                                         
                                                                                                                           
  Delegation 的价值是：                                                                                                    
                                                                                                                           
  不是一个人按顺序慢慢做，而是把任务并行拆开。                                                                             
                                                                                                                           
  ———                                                                                                                      
                                                                                                                           
  第 3 步：Specialist Agents 介入                                                                                          
                                                                                                                           
  这时候 coordinating agent 可能会叫一个：                                                                                 
                                                                                                                           
  single-cell specialist                                                                                                   
                                                                                                                           
  这个 specialist 的作用不是“另一个聊天机器人随便说”，而是带有单细胞分析 SOP。
                                                                                                                           
  它会更偏向这样做：                                                                                                       
                                                                                                                           
  1. 检查每个细胞的 gene count                                                                                             
  2. 检查 mitochondrial percentage                                                                                         
  3. 过滤低质量细胞                                                                                                        
  4. normalize                                                                                                             
  5. log transform                                                                                                         
  6. 找 highly variable genes                                                                                              
  7. PCA                                                                                                                   
  8. neighbors                                                                                                             
  9. UMAP                                                                                                                  
  10. Leiden clustering                                                                                                    
  11. marker gene annotation                                                                                               
  12. treatment/control comparison                                                                                         
                                                                                                                           
  如果是普通模型，可能会漏步骤。                                                                                           
  Specialist 的价值是：                                                                                                    
                                                                                                                           
  让任务按领域规范走，而不是临时发挥。                                                                                     
                                                                                                                           
  ———                                                                                                                      
                                                                                                                           
  第 4 步：Tools / 本地执行开始干活                                                                                        
                                                                                                                           
  接下来真正执行。                                                                                                         
                                                                                                                           
  Claude Science 会在这个 Session 的 Workspace 里写代码，比如：                                                            
                                                                                                                           
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
                                                                                                                           
  然后它会在本机 Python kernel 里跑：                                                                                      
                                                                                                                           
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
                                                                                                                           
  这里它已经不是聊天了，而是在实际执行代码。                                                                               
                                                                                                                           
  ———                                                                                                                      
                                                                                                                           
  第 5 步：如果需要查外部知识，调用 connector                                                                              
                                                                                                                           
  比如它要确认 T 细胞 marker gene：                                                                                        
                                                                                                                           
  CD3D                                                                                                                     
  CD3E                                                                                                                     
  TRAC                                                                                                                     
  PDCD1                                                                                                                    
  CTLA4                                                                                                                    
  LAG3                                                                                                                     
  HAVCR2                                                                                                                   
  GZMB                                                                                                                     
  IFNG                                                                                                                     
                                                                                                                           
  它可能会调用公共数据库 connector：                                                                                       
                                                                                                                           
  UniProt                                                                                                                  
  Reactome                                                                                                                 
  OpenAlex / PubMed                                                                                                        
  其他生命科学数据库                                                                                                       
                                                                                                                           
  用途是：                                                                                                                 
                                                                                                                           
  确认 marker gene 含义                                                                                                    
  补充 pathway 解释                                                                                                        
  查 exhaustion markers 的文献依据                                                                                         
                                                                                                                           
  也就是说：                                                                                                               
                                                                                                                           
  本地数据分析 + 外部知识查询                                                                                              
                                                                                                                           
  结合起来。                                                                                                               
                                                                                                                           
  ———                                                                                                                      
                                                                                                                           
  第 6 步：生成 Artifacts                                                                                                  
                                                                                                                           
  跑完以后，它不会只说“分析完成”。                                                                                         
                                                                                                                           
  它会保存几个正式结果对象：                                                                                               
                                                                                                                           
  Artifact 1：UMAP 图                                                                                                      
  Artifact 2：T cell marker gene 表                                                                                        
  Artifact 3：QC summary 表                                                                                                
  Artifact 4：简短分析报告                                                                                                 
                                                                                                                           
  这些 artifact 和普通文件的区别是：                                                                                       
                                                                                                                           
  可以直接查看                                                                                                             
  有版本                                                                                                                   
  知道是哪些代码生成的                                                                                                     
  知道运行环境                                                                                                             
  知道执行日志                                                                                                             
  可以被 reviewer 检查                                                                                                     
                                                                                                                           
  比如 UMAP 图的 provenance 里可能有：                                                                                     
                                                                                                                           
  生成它的用户请求                                                                                                         
  生成它的 Python 代码                                                                                                     
  运行日志                                                                                                                 
  scanpy 版本                                                                                                              
  输入数据路径                                                                                                             
  生成时间                                                                                                                 
  reviewer 检查结果                                                                                                        
                                                                                                                           
  ———                                                                                                                      
                                                                                                                           
  第 7 步：Reviewer 检查                                                                                                   
                                                                                                                           
  最后 reviewer 来检查 Claude 的结论。                                                                                     

  Claude 可能写：                                                                                                          
                                                                                                                           
  治疗组 T 细胞显示更强的 exhaustion 特征，                                                                                
  PDCD1、CTLA4、LAG3 在治疗组中上调。                                                                                      
                                                                                                                           
  Reviewer 会看：                                                                                                          
                                                                                                                           
  代码是否真的做了 treatment vs control？                                                                                  
  metadata 里是否真的有 treatment/control？                                                                                
  PDCD1、CTLA4、LAG3 是否真的上调？                                                                                        
  p 值和 logFC 是否支持？                                                                                                  
  图表是否对应正确分组？                                                                                                   
  有没有代码报错？                                                                                                         
                                                                                                                           
  如果发现问题，它可能指出：                                                                                               
                                                                                                                           
  Warning:                                                                                                                 
  结论中说 LAG3 显著上调，但 marker_genes.csv 中 adjusted p-value = 0.12，                                                 
  不应称为显著上调。                                                                                                       
                                                                                                                           
  这时候 Claude 应该改成：                                                                                                 
                                                                                                                           
  PDCD1 和 CTLA4 在治疗组显著上调；                                                                                        
  LAG3 有上调趋势，但未达到显著性。                                                                                        
                                                                                                                           
  这就是 reviewer 的价值。           
————---------------------------                                                                                                                      
  用户：                                                                                                                   
  帮我分析肺癌单细胞数据                                                                                                   
                                                                                                                           
  ↓                                                                                                                        
  Coordinating Agent：                                                                                                     
  理解任务，制定计划，请求权限                                                                                             
                                                                                                                           
  ↓                                                                                                                        
  Delegation：
  如果任务复杂，它可能把任务拆成几条 track：
  （把可上一层给他的可认为并发的任务拆出来）                                                                                                             
  拆成 QC、注释、差异分析、图表报告几条线                                                                                  
                                                                                                                           
  ↓                                                                                                                        
  Specialist Agent：                                                                                                       
  ↓
Specialist Agents 介入                                                                                          
                                                                                                                           
  这时候 coordinating agent 可能会叫一个：  
如果是普通模型，可能会漏步骤。                                                                                           
  Specialist 的价值是：                                                                                                    
                                                                                                                           
  让任务按领域规范走，而不是临时发挥。  
  Tools / Runtime：
  在本地 workspace 里写 Python/R，跑 scanpy/Seurat

  ↓
  Connectors：
  必要时查 marker gene、pathway、文献数据库

  ↓
  Artifacts：
  保存 UMAP 图、marker 表、QC 报告、分析报告

  ↓
  Reviewer：
  检查文字结论是否被代码、表格、图表和执行日志支持

  ↓
  用户：
  查看结果、要求改图、继续追问
