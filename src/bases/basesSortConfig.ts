import type { BasesDataItem } from "./helpers";
import type { TaskInfo } from "../types";
import type TaskNotesPlugin from "../main";

// 辅助类型检查：判断一个值是否为非 null 的对象（用于安全访问 basesData 的属性）。
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

// 辅助类型：Bases 公式计算结果的内部结构，包含每个公式的缓存输出值。
type BasesFormulaResults = {
	cachedFormulaOutputs?: Record<string, unknown>;
};

// 辅助类型：Bases 原始数据项的结构，包含 frontmatter 和公式计算结果。
type BasesFormulaData = {
	frontmatter?: Record<string, unknown>;
	formulaResults?: BasesFormulaResults;
};

/**
 * 单一排序列的完整描述：要按哪一列排序，以及该列的排序方向（升序或降序）。
 * Bases 视图配置里的 `sort` 数组中的每一项，最终都会被归一化成这种形状，
 * 方便本模块按统一的接口处理，不用关心中间有哪些别名叫什么（column / property / field / id / name）。
 */
export type NormalizedBasesSortColumn = {
	/** 排序用的属性标识符，例如 "due"、"formula.urgencyScore"、"tasknotes_manual_order"。 */
	column: string;
	/** 归一化之后的方向：要么是小写的 "asc"，要么是小写的 "desc"。 */
	direction: "asc" | "desc";
};

/**
 * Bases 视图的 `getSortConfig()` 方法可能返回的原始形状：
 * - 要么是一个单独的排序项对象；
 * - 要么是一组排序项的数组（表示多列依次排序）；
 * - 要么根本没有配置（null / undefined / 空数组）。
 * 每一项里的字段名不固定，Bases 内部可能用 `column`、`property`、`field`、`id` 或 `name`
 * 来表示“按哪一列排”，本模块把它们都当成等价的备选键来读取。
 */
type RawBasesSortConfigItem = {
	column?: unknown;
	property?: unknown;
	field?: unknown;
	id?: unknown;
	name?: unknown;
	direction?: unknown;
};

/**
 * `getSortConfig()` 可能返回的完整原始类型：单个排序项、排序项数组，或者完全没配置（null / undefined）。
 */
type RawBasesSortConfig = RawBasesSortConfigItem | RawBasesSortConfigItem[] | null | undefined;

/**
 * 把一个可能来自 Bases 内部配置对象的“方向”字段归一化成小写的 "asc" 或 "desc"。
 * Bases 文件里常写作 "ASC" / "DESC"（全大写），也可能不写、写成 undefined，
 * 本函数统一按“看不出来就是升序”处理，避免下游比较器需要分别处理大小写。
 */
function normalizeDirection(direction: unknown): "asc" | "desc" {
	// 把方向值先转成字符串再转小写，这样无论是 "ASC"、"asc"、"desc" 还是别的写法都能被识别。
	// 先用 typeof 检查 direction 是否是字符串或数字，避免对象被 String() 转成 '[object Object]'。
	const directionStr = typeof direction === "string" || typeof direction === "number"
		? String(direction)
		: "asc";
	const normalized = directionStr.toLowerCase();
	// 只有明确写成 "desc"（不区分大小写）才是降序，其余一律按升序处理。
	return normalized === "desc" ? "desc" : "asc";
}

/**
 * 把 Bases 原始的 `getSortConfig()` 返回值归一化成 `NormalizedBasesSortColumn[]`：
 * - 没有配置（null / undefined / 空数组 / 没有可识别的列名）时返回空数组，表示“不需要额外排序”；
 * - 有配置时，按原始数组里的顺序逐项归一化（列名缺失的项会被跳过，保持多列排序的先后次序不变）。
 */
export function normalizeBasesSortConfig(config: RawBasesSortConfig): NormalizedBasesSortColumn[] {
	// 没有配置，直接返回空数组，调用方看到空数组就知道不需要做任何排序。
	if (config === null || config === undefined) return [];

	// Bases 可能只给单个对象，也可能给对象数组；统一都变成数组，方便后面用 for 循环逐项处理。
	const items: RawBasesSortConfigItem[] = Array.isArray(config) ? config : [config];

	const normalized: NormalizedBasesSortColumn[] = [];

	// 按原始顺序逐项处理，保证多列排序时“先按第一列排，再按第二列排”的先后关系不被打乱。
	for (const item of items) {
		// 跳过明显不是对象的项（例如 null），避免后面读属性时出错。
		if (!item || typeof item !== "object") continue;

		// Bases 内部对“列名”的字段命名不统一，依次尝试 column / property / field / id / name，
		// 取第一个能拿到非空字符串的，作为这一项真正要排序的列。
		const candidateColumns: unknown[] = [item.column, item.property, item.field, item.id, item.name];
		let column: string | undefined;
		for (const candidate of candidateColumns) {
			// 只有拿到非空字符串才算“有列名”，空字符串或 undefined 都跳过，继续看下一个备选键。
			if (typeof candidate === "string" && candidate.length > 0) {
				column = candidate;
				break;
			}
		}

		// 如果所有备选键都没有找到可用的列名，这一项无法参与排序，直接跳过，不影响其它项。
		if (!column) continue;

		// 找到列名后，把方向也归一化，组成一个完整的“按哪列、什么方向”的排序条目，追加到结果里。
		normalized.push({ column, direction: normalizeDirection(item.direction) });
	}

	// 返回归一化后的排序列列表；如果原始配置里没有任何可用列，这里就是空数组。
	return normalized;
}

/**
 * 解析“某个任务在某一行（按某一列）应该用什么值参与比较”。
 * 优先读 TaskInfo 上直接映射好的常用字段；找不到对应字段时，
 * 再退而求其次读 Bases 原始条目（BasesDataItem）的 properties（含 formula.* 计算结果），
 * 最后兜底读 TaskInfo 上的同名字段（例如自定义字段名）。
 */
export function resolveBasesSortValue(
	task: TaskInfo,
	dataItem: BasesDataItem | undefined,
	column: string
): unknown {
	// 把可能带 "note." / "task." / "file." 前缀的列名去掉前缀，得到真正的属性叶子名。
	// 例如 "task.due" -> "due"，"note.status" -> "status"，Bases 里列经常带这种前缀。
	const clean = column.replace(/^(note\.|task\.|file\.|formula\.)/, "");

	// 先用几个最常用的、TaskInfo 上一定有明确类型的字段做快速映射，避免每次都走 properties 兜底。
	switch (clean) {
		case "due":
			return task.due;
		case "scheduled":
			return task.scheduled;
		case "status":
			return task.status;
		case "priority":
			return task.priority;
		case "title":
			return task.title;
		case "completedDate":
			return task.completedDate;
		case "dateCreated":
			return task.dateCreated;
		case "dateModified":
			return task.dateModified;
		case "timeEstimate":
			return task.timeEstimate;
		// "tasknotes_manual_order" / "sort_order" 都是插件用来记录“手动拖拽排序”的 frontmatter 字段，
		// 在 TaskInfo 上对应 task.sortOrder（LexoRank 字符串），直接用。
		case "sort_order":
		case "tasknotes_manual_order":
			return task.sortOrder;
	}

	// 没命中上面的常用字段时，尝试从 Bases 原始条目读（含已缓存的 formula.* 计算结果）。
	if (dataItem) {
		const props = dataItem.properties;
		// 先按去掉前缀后的叶子名找（例如 "urgencyScore"），再按完整列名找（例如 "formula.urgencyScore"），
		// 因为 BasesDataItem.properties 里存的键名可能是带 "formula." 前缀的完整名。
		if (props && clean in props) return props[clean];
		if (props && column in props) return props[column];

		// 补充查找已缓存的公式计算结果。
		// computeBasesFormulas 会将公式结果写入 item.basesData.formulaResults.cachedFormulaOutputs，
		// 而不是写入 item.properties，所以这里需要单独检查。
		// cachedFormulaOutputs 的键是不带前缀的公式名（例如 "urgencyScore"），
		// 所以我们用 clean 名字直接查找即可。
		// basesData 的类型是 unknown，需要先做类型守卫才能安全访问其属性。
		// 用 isRecord 检查 basesData 是否为对象，再向下转型为 BasesFormulaData 以访问 formulaResults。
		const basesData = isRecord(dataItem.basesData) ? dataItem.basesData as BasesFormulaData : undefined;
		const cachedFormulaOutputs = basesData?.formulaResults?.cachedFormulaOutputs;
		if (cachedFormulaOutputs && typeof cachedFormulaOutputs === "object") {
			if (clean in cachedFormulaOutputs) {
				return cachedFormulaOutputs[clean];
			}
			// 也尝试带 "formula." 前缀的键名，以防某些场景下存的是完整名。
			const formulaKey = `formula.${clean}`;
			if (formulaKey in cachedFormulaOutputs) {
				return cachedFormulaOutputs[formulaKey];
			}
		}
	}

	// 最后兜底：直接看 TaskInfo 上是否恰好有同名字段（例如用户自定义字段映射进来的属性）。
	// 先转成 unknown 再转成 Record，避免 TypeScript 认为两种类型不兼容而报错。
	return ((task as unknown) as Record<string, unknown>)[clean];
}

/**
 * 比较两个“取出来的排序值”。核心原则：
 * 1. 缺少/为空的值永远排在最后（不管升序还是降序），避免空值把有意义的值挤掉；
 * 2. 数值型按数值大小比较；日期型（ISO 日期字符串）按时间先后比较；其余按字符串字典序比较。
 */
export function compareBasesSortValues(valueA: unknown, valueB: unknown): number {
	// 先判断“缺失”：undefined、null、空字符串都算缺失，用 0 表示“没有值”。
	const isMissing = (value: unknown): boolean => value === undefined || value === null || value === "";
	const missingA = isMissing(valueA);
	const missingB = isMissing(valueB);

	// 两边都没有值：无法区分先后，返回 0（表示相等，交给下一个排序列或稳定排序决定）。
	if (missingA && missingB) return 0;
	// 只有 A 没有值：A 应该排在 B 后面，返回正数（1），让排序器把 B 放前面。
	if (missingA) return 1;
	// 只有 B 没有值：B 应该排在 A 后面，返回负数（-1），让排序器把 A 放前面。
	if (missingB) return -1;

	// 两个都是数字：直接按数值大小相减（小减大是负数，大减小是正数），标准写法。
	if (typeof valueA === "number" && typeof valueB === "number") {
		return valueA - valueB;
	}

	// 两个都是字符串：先试一下是不是“可解析的 ISO 日期字符串”（YYYY-MM-DD 起头），是的话按时间先后排，
	// 因为字典序碰巧对 ISO 日期也能用，但显式解析更稳健，能兼容带时间后缀（THH:mm）的写法。
	if (typeof valueA === "string" && typeof valueB === "string") {
		const timeA = parseIsoDate(valueA);
		const timeB = parseIsoDate(valueB);
		if (!isNaN(timeA) && !isNaN(timeB)) {
			return timeA - timeB;
		}
		// 不是日期字符串，就按普通字符串的字典序（localeCompare 会处理国际化排序规则）。
		return valueA.localeCompare(valueB);
	}

	// 其它任意类型（对象、布尔等）：统一转成字符串再按字典序比较，保证比较器不会抛异常。
	return String(valueA).localeCompare(String(valueB));
}

/**
 * 尝试把字符串解析成“日期对应的 UTC 毫秒时间戳”；解析不出来就返回 NaN，
 * 调用方可以用 isNaN() 判断“这个值其实不是日期，不能按时间排”。
 * 只认开头是 YYYY-MM-DD 的字符串（不管后面有没有时间部分），这样既能比较纯日期，
 * 也能对同一天的不同时刻做粗略比较（按日期粒度，不做更细的时分秒比较，避免超出本模块的职责）。
 */
function parseIsoDate(value: string): number {
	// 用正则匹配开头是不是 4 位年 + 2 位月 + 2 位日 这种日期形状。
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
	// 匹配不上，说明不是日期字符串，返回 NaN 表示“无法按日期比较”。
	if (!match) return NaN;

	// 匹配上了：取出年、月、日，月份转成 0 起（JS Date 的月是 0-11），
	// 用 Date.UTC 算出这一天的时间戳，供 compareBasesSortValues 做数值比较。
	return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * 核心入口：按 Bases 视图的排序配置（可能包含多列、每列可能升序或降序）给 TaskInfo 数组排序，
 * 返回一个“新数组”（不修改传入的 taskNotes，避免副作用影响调用方持有的原引用）。
 * 如果没有配置任何排序列，直接原样返回（保持 Bases 引擎给的顺序，不做多余处理）。
 */
export function sortTaskInfosByBasesSortConfig(
	taskNotes: TaskInfo[],
	dataItems: BasesDataItem[],
	rawSortConfig: RawBasesSortConfig,
	plugin: TaskNotesPlugin
): TaskInfo[] {
	// 把原始配置归一化；如果归一化出来是空数组，说明没有可用的排序列，直接按原顺序返回。
	const sortColumns = normalizeBasesSortConfig(rawSortConfig);
	if (sortColumns.length === 0) {
		// 复制一份原数组再返回，避免直接返回 taskNotes 引用后，调用方误以为这是“原地排序”副作用的产物。
		return [...taskNotes];
	}

	// 建立 path -> BasesDataItem 的查找表，避免比较函数每次都要线性扫描 dataItems 数组。
	const dataItemByPath = new Map<string, BasesDataItem>();
	for (const item of dataItems) {
		// 只有拿到路径的条目才放进表里；没有路径的条目无法和具体任务对应，跳过。
		if (item?.path) dataItemByPath.set(item.path, item);
	}

	// 复制一份原数组再原地排序（Array.prototype.sort 是原地排序，且默认不稳定），
	// 这样调用方手里的原 taskNotes 引用不会被改动，符合“纯函数”的直觉，也方便写单元测试。
	const ordered = [...taskNotes];

	// 排序比较器：依次按每一个排序列比较，只要某一列能分出大小就先返回该列的结果；
	// 全部列都比不出差异（返回 0）时，最终也返回 0，交给排序器保持“稳定”的相对顺序。
	ordered.sort((left, right) => {
		// 依次遍历配置里的每一列，直到某一列分出先后顺序为止。
		for (const sortColumn of sortColumns) {
			// 取出左右两个任务在这一列上各自的排序值。
			const valueLeft = resolveBasesSortValue(
				left,
				dataItemByPath.get(left.path),
				sortColumn.column
			);
			const valueRight = resolveBasesSortValue(
				right,
				dataItemByPath.get(right.path),
				sortColumn.column
			);

			// 按“升序基准”比较：valueLeft 相对 valueRight 是“应该排在前”还是“排在后”。
			const comparison = compareBasesSortValues(valueLeft, valueRight);

			// 这一列分不出先后（返回 0）时，继续看下一列；分得出来时，按这一列的方向（asc/desc）返回结果，
			// 后面的列就不再参与这一对元素的比较了（“第一列分出结果后立刻生效，不继续往下比”的多列排序语义）。
			if (comparison !== 0) {
				// 降序时把基准比较结果取反（原来“小于 0”表示 left 更靠前的值，取反后反而排到后面）。
				return sortColumn.direction === "desc" ? -comparison : comparison;
			}
		}

		// 所有列都比不出差异：返回 0，交给排序器按“稳定的原始相对顺序”处理（V8 的 Array.prototype.sort
		// 对已排序/近乎有序的输入在多数场景下会保持相对位置不变，这里再不做额外 tie-break，
		// 避免引入 Bases 引擎本身没有承诺过的排序细节）。
		return 0;
	});

	// 返回排序后的新数组。
	return ordered;
}

/**
 * 供 Kanban 等“已经知道该用哪一列、但还没有排序值映射”的场景使用：
 * 生成一个“path -> 排序值”的映射表，键是任务路径，值是该任务在指定列上的排序值，
 * 调用方可以拿这个 Map 直接驱动现有的字符串排序逻辑（例如 Kanban 已有的 sortKanbanGroupsBySortOrder）。
 */
export function buildBasesSortValueByPath(
	taskNotes: readonly TaskInfo[],
	dataItems: readonly BasesDataItem[],
	column: string
): Map<string, unknown> {
	// 先建好 path -> BasesDataItem 的表，逻辑和 sortTaskInfosByBasesSortConfig 里一致。
	const dataItemByPath = new Map<string, BasesDataItem>();
	for (const item of dataItems) {
		if (item?.path) dataItemByPath.set(item.path, item);
	}

	// 结果 Map：每个任务路径对应“这一列上该任务的排序值”。
	const valuesByPath = new Map<string, unknown>();

	// 逐个任务计算并写进 Map，跳过没有路径的任务（拿不到路径就无法作为 Map 的键）。
	for (const task of taskNotes) {
		if (!task.path) continue;
		valuesByPath.set(task.path, resolveBasesSortValue(task, dataItemByPath.get(task.path), column));
	}

	// 把 plugin 参数留在函数签名里（当前实现里其实没用到，保留是为了调用方将来若需要按插件字段映射
	// 解析列名时，可以直接扩展这个函数而不破坏现有调用点）。
	return valuesByPath;
}