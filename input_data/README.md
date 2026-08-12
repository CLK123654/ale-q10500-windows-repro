# 短链迁移材料

shortlink_requests.csv是活动运营导出的脱敏申请表，其中包含落地地址、短码意向、活动参数、到期时间和优先级。这是本次迁移的待办清单。

migration_policy.json来自增长平台的发布管理配置，说明处理时刻与切换窗口，也列出允许的主机、query字段、UTM字段、短码格式和申请顺序。

existing_slugs.json保存切换前的现网短码脱敏快照。owner_team、status、expires_at_utc和target_url用于识别原短码能否沿用或收回，以及是否需要分配新后缀。

starter/build_redirect_map.mjs是待完成的Node.js程序。把完成版保存到output/src/build_redirect_map.mjs，再在输入包解压目录执行node output/src/build_redirect_map.mjs input_data output。程序读取上述三份业务文件，将路由映射、申请处置记录和迁移汇总写入output。
