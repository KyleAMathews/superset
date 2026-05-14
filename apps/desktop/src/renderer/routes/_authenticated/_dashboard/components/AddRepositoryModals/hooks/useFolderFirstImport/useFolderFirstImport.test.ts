import { beforeEach, describe, expect, it, mock } from "bun:test";

const selectDirectoryMock = mock(async () => ({
	canceled: false,
	path: "/repos/octocat",
}));
const findByPathMock = mock(async () => ({
	candidates: [] as MatchingProject[],
	cloudErrors: [] as CloudLookupError[],
}));
const setupMock = mock(async () => ({
	repoPath: "/repos/octocat",
	mainWorkspaceId: "workspace-1",
}));
const createMock = mock(async () => ({
	projectId: "created-project",
	repoPath: "/repos/octocat",
	mainWorkspaceId: "workspace-created",
}));
const finalizeSetupMock = mock(() => undefined);
const getHostServiceClientByUrlMock = mock(() => ({
	project: {
		findByPath: { query: findByPathMock },
		setup: { mutate: setupMock },
		create: { mutate: createMock },
	},
}));

let activeHostUrl: string | null = "http://host-service";

interface MatchingProject {
	id: string;
	name: string;
}

interface CloudLookupError {
	url: string;
	message: string;
}

mock.module("react", () => ({
	useCallback: <T extends (...args: never[]) => unknown>(callback: T) =>
		callback,
}));

mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		window: {
			selectDirectory: {
				useMutation: () => ({ mutateAsync: selectDirectoryMock }),
			},
		},
	},
}));

mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: getHostServiceClientByUrlMock,
}));

mock.module("renderer/react-query/projects", () => ({
	useFinalizeProjectSetup: () => finalizeSetupMock,
}));

mock.module(
	"renderer/routes/_authenticated/providers/LocalHostServiceProvider",
	() => ({
		useLocalHostService: () => ({ activeHostUrl }),
	}),
);

const { useFolderFirstImport } = await import("./useFolderFirstImport");

describe("useFolderFirstImport", () => {
	beforeEach(() => {
		activeHostUrl = "http://host-service";
		selectDirectoryMock.mockClear();
		selectDirectoryMock.mockResolvedValue({
			canceled: false,
			path: "/repos/octocat",
		});
		findByPathMock.mockClear();
		findByPathMock.mockResolvedValue({
			candidates: [],
			cloudErrors: [],
		});
		setupMock.mockClear();
		setupMock.mockResolvedValue({
			repoPath: "/repos/octocat",
			mainWorkspaceId: "workspace-1",
		});
		createMock.mockClear();
		createMock.mockResolvedValue({
			projectId: "created-project",
			repoPath: "/repos/octocat",
			mainWorkspaceId: "workspace-created",
		});
		finalizeSetupMock.mockClear();
		getHostServiceClientByUrlMock.mockClear();
	});

	it("reports cloud lookup errors instead of creating a duplicate local import when no candidates exist", async () => {
		findByPathMock.mockResolvedValue({
			candidates: [],
			cloudErrors: [
				{
					url: "https://github.com/octocat/hello.git",
					message: "cloud-down",
				},
			],
		});
		const onError = mock(() => undefined);

		const result = await useFolderFirstImport({ onError }).start();

		expect(result).toBeNull();
		expect(findByPathMock).toHaveBeenCalledWith({ repoPath: "/repos/octocat" });
		expect(onError).toHaveBeenCalledWith(
			"Couldn't reach cloud for https://github.com/octocat/hello.git: cloud-down",
		);
		expect(createMock).not.toHaveBeenCalled();
		expect(setupMock).not.toHaveBeenCalled();
		expect(finalizeSetupMock).not.toHaveBeenCalled();
	});

	it("keeps folder-first candidate import flowing even when the lookup response includes cloud errors", async () => {
		findByPathMock.mockResolvedValue({
			candidates: [{ id: "local-project", name: "octocat" }],
			cloudErrors: [
				{
					url: "https://github.com/octocat/hello.git",
					message: "cloud-down",
				},
			],
		});
		const onError = mock(() => undefined);

		const result = await useFolderFirstImport({ onError }).start();

		expect(result).toEqual({
			projectId: "local-project",
			repoPath: "/repos/octocat",
			mainWorkspaceId: "workspace-1",
		});
		expect(setupMock).toHaveBeenCalledWith({
			projectId: "local-project",
			mode: { kind: "import", repoPath: "/repos/octocat" },
		});
		expect(createMock).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
		expect(finalizeSetupMock).toHaveBeenCalledWith("http://host-service", {
			projectId: "local-project",
			repoPath: "/repos/octocat",
			mainWorkspaceId: "workspace-1",
		});
	});
});
