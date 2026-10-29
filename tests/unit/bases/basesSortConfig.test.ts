import type { BasesDataItem } from "../../../src/bases/helpers";
import type { TaskInfo } from "../../../src/types";
import {
	resolveBasesSortValue,
	sortTaskInfosByBasesSortConfig,
	compareBasesSortValues,
} from "../../../src/bases/basesSortConfig";

describe("resolveBasesSortValue", () => {
	it("reads formula results from cachedFormulaOutputs when not in properties", () => {
		const task: TaskInfo = { title: "Task", status: "todo", path: "test.md" };
		const dataItem: BasesDataItem = {
			path: "test.md",
			properties: { priority: "high" },
			basesData: {
				formulaResults: {
					cachedFormulaOutputs: { urgencyScore: 95, score: 80 },
				},
			},
		};
		// 按公式列 "urgencyScore" 排序时，应该能从 cachedFormulaOutputs 读出 95
		expect(resolveBasesSortValue(task, dataItem, "urgencyScore")).toBe(95);
		// 按 "score" 列时读出 80
		expect(resolveBasesSortValue(task, dataItem, "score")).toBe(80);
	});

	it("prefers properties over cachedFormulaOutputs when both exist", () => {
		const task: TaskInfo = { title: "Task", status: "todo", path: "test.md" };
		const dataItem: BasesDataItem = {
			path: "test.md",
			properties: { urgencyScore: 70 },
			basesData: {
				formulaResults: {
					cachedFormulaOutputs: { urgencyScore: 95 },
				},
			},
		};
		// 优先读 properties（前端显式设置的值）
		expect(resolveBasesSortValue(task, dataItem, "urgencyScore")).toBe(70);
	});

	it("supports formula prefix in cachedFormulaOutputs keys", () => {
		const task: TaskInfo = { title: "Task", status: "todo", path: "test.md" };
		const dataItem: BasesDataItem = {
			path: "test.md",
			properties: {},
			basesData: {
				formulaResults: {
					cachedFormulaOutputs: { "formula.urgencyScore": 42 },
				},
			},
		};
		// clean 名字 urgencyScore 找不到时，应尝试 formula.urgencyScore
		expect(resolveBasesSortValue(task, dataItem, "urgencyScore")).toBe(42);
	});

	it("does not read task.customProperties because resolveBasesSortValue only checks top-level properties", () => {
		// customProperties 是嵌套在 task.customProperties 里的，resolveBasesSortValue
		// 最后用 (task as Record)[clean] 直接访问顶层属性，不会去读 task.customProperties。
		// 自定义字段的值在 Bases 视图里总是通过 properties 或 cachedFormulaOutputs 传入的，
		// 所以这不是实际使用中的问题。
		const task: TaskInfo = {
			title: "Task",
			status: "todo",
			path: "test.md",
			customProperties: { myCustomField: "hello" },
		};
		const dataItem: BasesDataItem = {
			path: "test.md",
			properties: {},
		};
		expect(resolveBasesSortValue(task, dataItem, "myCustomField")).toBeUndefined();
	});

	it("returns undefined when nothing is found", () => {
		const task: TaskInfo = { title: "Task", status: "todo", path: "test.md" };
		const dataItem: BasesDataItem = { path: "test.md", properties: {} };
		expect(resolveBasesSortValue(task, dataItem, "missingField")).toBeUndefined();
	});

	it("handles string column names with prefixes like task.due and formula.score", () => {
		const task: TaskInfo = {
			title: "A",
			status: "todo",
			due: "2025-03-01",
			path: "test.md",
		};
		const dataItem: BasesDataItem = {
			path: "test.md",
			properties: {},
			basesData: {
				formulaResults: {
					cachedFormulaOutputs: { score: 10 },
				},
			},
		};
		// task.due -> due
		expect(resolveBasesSortValue(task, dataItem, "task.due")).toBe("2025-03-01");
		// formula.score -> score (reads from cachedFormulaOutputs)
		expect(resolveBasesSortValue(task, dataItem, "formula.score")).toBe(10);
	});
});

describe("sortTaskInfosByBasesSortConfig", () => {
	it("sorts tasks by formula column from cachedFormulaOutputs", () => {
		const taskA: TaskInfo = { title: "A", status: "todo", path: "a.md" };
		const taskB: TaskInfo = { title: "B", status: "todo", path: "b.md" };
		const taskC: TaskInfo = { title: "C", status: "todo", path: "c.md" };

		const dataItems: BasesDataItem[] = [
			{ path: "a.md", properties: {}, basesData: { formulaResults: { cachedFormulaOutputs: { score: 90 } } } },
			{ path: "b.md", properties: {}, basesData: { formulaResults: { cachedFormulaOutputs: { score: 30 } } } },
			{ path: "c.md", properties: {}, basesData: { formulaResults: { cachedFormulaOutputs: { score: 70 } } } },
		];

		const result = sortTaskInfosByBasesSortConfig(
			[taskA, taskB, taskC],
			dataItems,
			[{ column: "score", direction: "asc" }],
			{} as any
		);

		// 按 score 升序排列：B(30) < C(70) < A(90)
		expect(result.map((t) => t.title)).toEqual(["B", "C", "A"]);
	});

	it("handles descending sort direction with formula values", () => {
		const taskA: TaskInfo = { title: "A", status: "todo", path: "a.md" };
		const taskB: TaskInfo = { title: "B", status: "todo", path: "b.md" };
		const taskC: TaskInfo = { title: "C", status: "todo", path: "c.md" };

		const dataItems: BasesDataItem[] = [
			{ path: "a.md", properties: {}, basesData: { formulaResults: { cachedFormulaOutputs: { score: 90 } } } },
			{ path: "b.md", properties: {}, basesData: { formulaResults: { cachedFormulaOutputs: { score: 30 } } } },
			{ path: "c.md", properties: {}, basesData: { formulaResults: { cachedFormulaOutputs: { score: 70 } } } },
		];

		const result = sortTaskInfosByBasesSortConfig(
			[taskA, taskB, taskC],
			dataItems,
			[{ column: "score", direction: "desc" }],
			{} as any
		);

		// 按 score 降序排列：A(90) > C(70) > B(30)
		expect(result.map((t) => t.title)).toEqual(["A", "C", "B"]);
	});

	it("returns copy without modification when no sort config", () => {
		const taskA: TaskInfo = { title: "A", status: "todo", path: "a.md" };
		const taskB: TaskInfo = { title: "B", status: "todo", path: "b.md" };
		const input = [taskA, taskB];
		const result = sortTaskInfosByBasesSortConfig(input, [], null as any, {} as any);
		// 原数组未被修改
		expect(result[0]).toBe(taskA);
		expect(result).not.toBe(input);
	});
});

describe("compareBasesSortValues", () => {
	it("puts missing values last regardless of direction", () => {
		expect(compareBasesSortValues("2025-01-01", undefined)).toBeLessThan(0);
		expect(compareBasesSortValues("2025-01-01", null)).toBeLessThan(0);
		expect(compareBasesSortValues("2025-01-01", "")).toBeLessThan(0);
	});

	it("compares ISO date strings correctly", () => {
		expect(compareBasesSortValues("2025-01-01", "2025-03-01")).toBeLessThan(0);
		expect(compareBasesSortValues("2025-03-01", "2025-01-01")).toBeGreaterThan(0);
		expect(compareBasesSortValues("2025-01-01", "2025-01-01")).toBe(0);
	});

	it("compares numeric values correctly", () => {
		expect(compareBasesSortValues(10, 20)).toBeLessThan(0);
		expect(compareBasesSortValues(20, 10)).toBeGreaterThan(0);
	});

	it("compares strings with localeCompare", () => {
		expect(compareBasesSortValues("apple", "banana")).toBeLessThan(0);
		expect(compareBasesSortValues("banana", "apple")).toBeGreaterThan(0);
	});
});
