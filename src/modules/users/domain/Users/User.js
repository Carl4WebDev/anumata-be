export default class User {
  constructor({ user_id, email, password_hash, full_name }) {
    this.user_id = user_id;
    this.email = email;
    this.password_hash = password_hash;
    this.full_name = full_name;
  }
}
