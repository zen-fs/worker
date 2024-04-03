import { ApiError, ErrorCode, type Backend } from '@zenfs/core';
import { Cred } from '@zenfs/core/cred.js';
import { File } from '@zenfs/core/file.js';
import { Async, FileSystem, type FileSystemMetadata } from '@zenfs/core/filesystem.js';
import type { FileType } from '@zenfs/core/stats.js';
import { Stats } from '@zenfs/core/stats.js';
import * as RPC from './rpc.js';
import type { ExtractProperties } from './utils.js';

type FileMethods = ExtractProperties<File, (...args: unknown[]) => Promise<unknown>>;
type FileMethod = keyof FileMethods;
interface FileRequest<TMethod extends FileMethod = FileMethod> extends RPC.Request<'file', TMethod, Parameters<FileMethods[TMethod]>> {
	fd: number;
}

export class PortFile extends File {
	constructor(
		public readonly fs: PortFS,
		public readonly fd: number,
		public readonly path: string,
		public position?: number
	) {
		super();
	}

	public rpc<const T extends FileMethod>(method: T, ...args: Parameters<FileMethods[T]>): Promise<Awaited<ReturnType<FileMethods[T]>>> {
		return RPC.request<FileRequest<T>, Awaited<ReturnType<FileMethods[T]>>>(
			{
				scope: 'file',
				fd: this.fd,
				method,
				args,
			},
			this.fs.options
		);
	}

	public stat(): Promise<Stats> {
		return this.rpc('stat');
	}

	public statSync(): Stats {
		throw new ApiError(ErrorCode.ENOTSUP);
	}

	public truncate(len: number): Promise<void> {
		return this.rpc('truncate', len);
	}

	public truncateSync(): void {
		throw new ApiError(ErrorCode.ENOTSUP);
	}

	public write(buffer: Uint8Array, offset?: number, length?: number, position?: number): Promise<number> {
		return this.rpc('write', buffer, offset, length, position);
	}

	public writeSync(): number {
		throw new ApiError(ErrorCode.ENOTSUP);
	}

	public read<TBuffer extends Uint8Array>(buffer: TBuffer, offset?: number, length?: number, position?: number): Promise<{ bytesRead: number; buffer: TBuffer }> {
		return <Promise<{ bytesRead: number; buffer: TBuffer }>>this.rpc('read', buffer, offset, length, position);
	}

	public readSync(): number {
		throw new ApiError(ErrorCode.ENOTSUP);
	}

	public chown(uid: number, gid: number): Promise<void> {
		return this.rpc('chown', uid, gid);
	}

	public chownSync(): void {
		throw new ApiError(ErrorCode.ENOTSUP);
	}

	public chmod(mode: number): Promise<void> {
		return this.rpc('chmod', mode);
	}

	public chmodSync(): void {
		throw new ApiError(ErrorCode.ENOTSUP);
	}

	public utimes(atime: Date, mtime: Date): Promise<void> {
		return this.rpc('utimes', atime, mtime);
	}

	public utimesSync(): void {
		throw new ApiError(ErrorCode.ENOTSUP);
	}

	public _setType(type: FileType): Promise<void> {
		return this.rpc('_setType', type);
	}

	public _setTypeSync(): void {
		throw new ApiError(ErrorCode.ENOTSUP);
	}

	public close(): Promise<void> {
		return this.rpc('close');
	}

	public closeSync(): void {
		throw new ApiError(ErrorCode.ENOTSUP);
	}

	public sync(): Promise<void> {
		return this.rpc('sync');
	}

	public syncSync(): void {
		throw new ApiError(ErrorCode.ENOTSUP);
	}
}

type FSMethods = ExtractProperties<FileSystem, (...args: unknown[]) => Promise<unknown> | FileSystemMetadata>;
type FSMethod = keyof FSMethods;
type FSRequest<TMethod extends FSMethod = FSMethod> = RPC.Request<'fs', TMethod, Parameters<FSMethods[TMethod]>>;

/**
 * PortFS lets you access a ZenFS instance that is running in a port, or the other way around.
 *
 * Note that synchronous operations are not permitted on the PortFS, regardless
 * of the configuration option of the remote FS.
 */
export class PortFS extends Async(FileSystem) {
	public readonly port: RPC.Port;
	public readonly options: Partial<RPC.Options>;

	/**
	 * Constructs a new PortFS instance that connects with ZenFS running on
	 * the specified port.
	 */
	public constructor({ port, ...options }: RPC.Options) {
		super();
		this.port = port;
		this.options = options;
		port['on' in port ? 'on' : 'addEventListener']('message', (message: RPC.Response) => {
			RPC.handleResponse(message);
		});
	}

	public metadata(): FileSystemMetadata {
		return {
			...super.metadata(),
			name: 'PortFS',
			synchronous: false,
		};
	}

	protected rpc<const T extends FSMethod>(method: T, ...args: Parameters<FSMethods[T]>): Promise<Awaited<ReturnType<FSMethods[T]>>> {
		return RPC.request<FSRequest<T>, Awaited<ReturnType<FSMethods[T]>>>(
			{
				scope: 'fs',
				method,
				args,
			},
			this.options
		);
	}

	public async ready(): Promise<this> {
		await this.rpc('ready');
		return this;
	}

	public rename(oldPath: string, newPath: string, cred: Cred): Promise<void> {
		return this.rpc('rename', oldPath, newPath, cred);
	}

	public async stat(p: string, cred: Cred): Promise<Stats> {
		return new Stats(await this.rpc('stat', p, cred));
	}

	public sync(path: string, data: Uint8Array, stats: Readonly<Stats>): Promise<void> {
		return this.rpc('sync', path, data, stats);
	}
	public openFile(p: string, flag: string, cred: Cred): Promise<File> {
		return this.rpc('openFile', p, flag, cred);
	}
	public createFile(p: string, flag: string, mode: number, cred: Cred): Promise<File> {
		return this.rpc('createFile', p, flag, mode, cred);
	}
	public unlink(p: string, cred: Cred): Promise<void> {
		return this.rpc('unlink', p, cred);
	}
	public rmdir(p: string, cred: Cred): Promise<void> {
		return this.rpc('rmdir', p, cred);
	}
	public mkdir(p: string, mode: number, cred: Cred): Promise<void> {
		return this.rpc('mkdir', p, mode, cred);
	}
	public readdir(p: string, cred: Cred): Promise<string[]> {
		return this.rpc('readdir', p, cred);
	}
	public exists(p: string, cred: Cred): Promise<boolean> {
		return this.rpc('exists', p, cred);
	}
	public link(srcpath: string, dstpath: string, cred: Cred): Promise<void> {
		return this.rpc('link', srcpath, dstpath, cred);
	}
}

let nextFd = 0;

const descriptors: Map<number, File> = new Map();

async function handleRequest(port: RPC.Port, fs: FileSystem, request: MessageEvent<RPC.Request> | RPC.Request): Promise<void> {
	const data = 'data' in request ? request.data : request;
	if (!RPC.isMessage(data)) {
		return;
	}
	const { method, args, id, scope, stack } = data;

	let value, error: boolean;

	try {
		switch (scope) {
			case 'fs':
				value = await fs[method](...args);
				if (value instanceof File) {
					descriptors.set(++nextFd, value);
					value = {
						fd: nextFd,
						path: value.path,
						position: value.position,
					};
				}
				break;
			case 'file':
				const { fd } = <FileRequest>data;
				if (!descriptors.has(fd)) {
					throw new ApiError(ErrorCode.EBADF);
				}
				value = await descriptors.get(fd)[method](...args);
				if (method == 'close') {
					descriptors.delete(fd);
				}
				break;
		}
	} catch (e) {
		value = e;
		error = true;
	}

	port.postMessage({
		_zenfs: true,
		scope,
		id,
		error,
		method,
		stack,
		value,
	});
}

export function attachFS(port: RPC.Port, fs: FileSystem): void {
	port['on' in port ? 'on' : 'addEventListener']('message', (request: MessageEvent<RPC.Request> | RPC.Request) => handleRequest(port, fs, request));
}

export function detachFS(port: RPC.Port, fs: FileSystem): void {
	port['off' in port ? 'off' : 'removeEventListener']('message', (request: MessageEvent<RPC.Request> | RPC.Request) => handleRequest(port, fs, request));
}

export const Port: Backend = {
	name: 'Port',

	options: {
		port: {
			type: 'object',
			description: 'The target port that you want to connect to',
			validator(port: RPC.Port) {
				// Check for a `postMessage` function.
				if (typeof port?.postMessage != 'function') {
					throw new ApiError(ErrorCode.EINVAL, 'option must be a port.');
				}
			},
		},
	},

	async isAvailable(): Promise<boolean> {
		if ('WorkerGlobalScope' in globalThis && globalThis instanceof globalThis.WorkerGlobalScope) {
			// Web Worker
			return true;
		}

		try {
			const worker_threads = await import('node:worker_threads');

			// NodeJS worker
			return 'Worker' in worker_threads;
		} catch (e) {
			return false;
		}
	},

	create(options: RPC.Options) {
		return new PortFS(options);
	},
};
