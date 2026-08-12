# 短链迁移输入

shortlink_requests.csv来自脱敏的活动短链申请导出，提供申请身份、落地地址、短码意向、活动参数和处理优先级，是迁移处理的主清单。

migration_policy.json由增长平台发布管理人编写，规定运行时刻、变更窗口、地址政策、UTM字段、短码合同和汇总状态，是地址规范化与短码分配的规则来源。

existing_slugs.json是切换前的现网短码脱敏快照，记录归属团队、状态、到期时间和目标地址，用于判断复用、回收与冲突。

starter/build_redirect_map.mjs是待完成的Node.js入口。三份业务材料都必须读取，输入保持只读，结果写入与input_data同级的output目录。
