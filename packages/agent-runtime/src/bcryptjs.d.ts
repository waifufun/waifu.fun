declare module "bcryptjs" {
	export function hash(data: string, saltOrRounds: string | number): Promise<string>;
	const bcrypt: { hash: typeof hash };
	export default bcrypt;
}
