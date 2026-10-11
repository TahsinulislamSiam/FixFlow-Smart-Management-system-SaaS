import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export const hashPassword = (plain) => bcrypt.hashSync(plain, ROUNDS);
export const verifyPassword = (plain, hash) => bcrypt.compareSync(plain, hash ?? '');
