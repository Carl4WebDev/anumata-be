export default class User {
  constructor({ user_id, email, password_hash, f_name, m_name, l_name }) {
    this.user_id = user_id;
    this.email = email;
    this.password_hash = password_hash;
    this.f_name = f_name;
    this.m_name = m_name;
    this.l_name = l_name;
    this.full_name = [f_name, m_name, l_name].filter(Boolean).join(" ");
  }
}
