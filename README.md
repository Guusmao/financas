# Finanças Pessoais (Supabase & Vite)

Aplicativo web para organização financeira pessoal. Permite gerenciar entradas, saídas, contas fixas, metas e reservas financeiras com persistência de dados em nuvem em tempo real e controle de acesso por usuário.

---

## 🛠️ Tecnologias

- **Core**: HTML5, Vanilla CSS e Vanilla JavaScript.
- **Empacotador & Dev Server**: [Vite](https://vitejs.dev/) (para carregamento rápido e suporte a variáveis de ambiente).
- **Backend & Banco de Dados**: [Supabase](https://supabase.com/) (Autenticação de usuários, Row Level Security e Banco de Dados PostgreSQL).
- **Hospedagem**: [Vercel](https://vercel.com/) (deploy contínuo integrado ao GitHub).

---

## 🚀 Como Executar Localmente

### 1. Pré-requisitos
Certifique-se de ter o [Node.js](https://nodejs.org/) instalado em sua máquina.

### 2. Configurar o Banco de Dados no Supabase
1. Crie um projeto gratuito em [supabase.com](https://supabase.com/).
2. Acesse a aba **SQL Editor** no painel do Supabase.
3. Clique em **New Query** e cole o seguinte script para criar as tabelas e habilitar a segurança de dados por usuário (RLS):

```sql
-- Habilitar UUID
create extension if not exists "uuid-ossp";

-- Tabela de Lançamentos (Entries)
create table entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null,
  type text not null,
  category text not null,
  description text not null,
  payment text not null,
  amount numeric(12, 2) not null,
  paid boolean default true,
  note text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabela de Contas Fixas (Bills)
create table bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  category text not null,
  amount numeric(12, 2) not null,
  due_day integer not null,
  recurrence text not null,
  active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabela de Metas (Goals)
create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  target numeric(12, 2) not null,
  saved numeric(12, 2) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabela de Reserva (Reserve)
create table reserve (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null,
  amount numeric(12, 2) not null,
  type text not null,
  note text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabela Motorista de Aplicativo
create table motorista_registros (
   id uuid primary key default gen_random_uuid(),
   user_id uuid references auth.users not null,
   data date not null,
   uber numeric(12, 2) not null default 0,
   noventa_nove numeric(12, 2) not null default 0,
   quilometragem numeric(12, 2) not null default 0,
   preco_gasolina numeric(12, 2) not null default 0,
   consumo_veiculo numeric(12, 2) not null default 0,
   created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Configurar Row Level Security (RLS) para isolar dados de cada usuário
alter table entries enable row level security;
alter table bills enable row level security;
alter table goals enable row level security;
alter table reserve enable row level security;
alter table motorista_registros enable row level security;

-- Políticas de RLS
create policy "Usuários podem ver seus próprios lançamentos" on entries for all using (auth.uid() = user_id);
create policy "Usuários podem ver suas próprias contas" on bills for all using (auth.uid() = user_id);
create policy "Usuários podem ver suas próprias metas" on goals for all using (auth.uid() = user_id);
create policy "Usuários podem ver suas próprias reservas" on reserve for all using (auth.uid() = user_id);
create policy "Usuários podem ver seus próprios registros de motorista" on motorista_registros for all using (auth.uid() = user_id);
```

4. Clique em **Run** no Supabase para criar as tabelas.
5. Em **Project Settings** -> **API**, copie a **Project URL** e a **API Key (anon/public)**.

### 3. Configurar as Variáveis de Ambiente
1. Copie o arquivo `.env.example` criando um arquivo chamado `.env`:
   ```bash
   cp .env.example .env
   ```
2. Abra o `.env` e insira suas credenciais do Supabase:
   ```env
   VITE_SUPABASE_URL=https://sua-url-do-supabase.supabase.co
   VITE_SUPABASE_ANON_KEY=seu-token-anon-do-supabase
   ```

### 3.1 Usar com Go Live (servidor estático)
Se você for abrir o projeto com **Go Live**, o `.env` não é processado. Nesse caso:
1. Copie `config.example.js` para `config.js`.
2. Preencha o arquivo `config.js` com seus dados do Supabase:
   ```js
   window.__APP_CONFIG__ = {
     SUPABASE_URL: "https://sua-url-do-supabase.supabase.co",
     SUPABASE_ANON_KEY: "seu-token-anon-do-supabase"
   };
   ```
3. Abra com Go Live normalmente.

> `config.js` está no `.gitignore` para evitar envio de credenciais.

### 4. Instalar e Executar
1. Instale as dependências do projeto:
   ```bash
   npm install
   ```
2. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
3. Acesse o endereço exibido no terminal (geralmente `http://localhost:5173`).

---

## 📦 Deploy na Vercel

1. Suba o projeto para o seu **GitHub**.
2. Acesse a [Vercel](https://vercel.com/), importe o repositório do projeto.
3. Durante as configurações do deploy, adicione as variáveis de ambiente:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Clique em **Deploy**. O build estático configurado no Vite será feito de forma automática.

---

## 📂 Estrutura de Pastas

- `index.html`: Página principal e interface com tela de autenticação integrada.
- `styles.css`: Estilos globais e componentes visuais (responsivo e estilizado).
- `app.js`: Configuração do cliente Supabase, controle de autenticação (cadastro/login/logout), gerenciamento de estado e requisições assíncronas ao banco de dados.
- `package.json`: Configurações de dependências do Node/Vite.
- `.gitignore`: Proteção para evitar o envio das credenciais de banco e logs ao repositório público.
