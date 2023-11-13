import { BindParameter, DBObject_IN } from "oracledb";

class FailBindData extends Error {}

type BindParam =
  | string
  | number
  | BindParameter
  | Date
  | DBObject_IN<any>
  | Buffer
  | null
  | undefined
  | { [key: string]: BindParam };
type ConstructorReturn = { query: string; bind: Record<string, BindParam> };

function generateRandomString(length = 6) {
  let result = "";
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"; // characters to include in the random string

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }

  return result;
}

function constructBind() {
  const bind: Record<string, BindParam> = {};

  function addBind(value: BindParam, specificKey?: string) {
    const key = specificKey || generateRandomString();

    bind[key] = value;

    return `:${key}`;
  }

  function concatBind(binds: Record<string, BindParam>) {
    Object.assign(bind, binds);
  }

  return { bind, addBind, concatBind };
}

type Param = BindParam | BindParam[] | ConstructorReturn | ConstructorReturn[];

export function sql(queries: TemplateStringsArray, ...params: Param[]) {
  const { bind, addBind, concatBind } = constructBind();

  if (params.length === 0) return { query: queries.join(""), bind };

  function handleQueryParam(query: string, param?: Param) {
    if (!param && param !== 0 && param !== null) return query;

    if (Array.isArray(param)) {
      if (param.length === 0) return query;

      const first = param[0];
      if (
        typeof first === "bigint" ||
        typeof first === "number" ||
        typeof first === "string"
      ) {
        return `${query}${(param as unknown as string[])
          .map((item) => addBind(item))
          .join(",")}`;
      }

      if (typeof first === "object") {
        if (
          first &&
          Object.keys(first).includes("query") &&
          Object.keys(first).includes("bind")
        ) {
          const innerQuery = first as unknown as {
            query: string;
            bind: Record<string, BindParam>;
          };
          concatBind(innerQuery.bind);

          return `${query}${innerQuery.query}`;
        }
      }

      return query;
    }

    if (
      typeof param === "string" ||
      typeof param === "number" ||
      typeof param === "bigint" ||
      param === null
    ) {
      return `${query}${addBind(param)}`;
    }

    if (typeof param === "object") {
      if (
        param &&
        Object.keys(param).includes("query") &&
        Object.keys(param).includes("bind")
      ) {
        const innerQuery = param as unknown as {
          query: string;
          bind: Record<string, BindParam>;
        };
        concatBind(innerQuery.bind);

        return `${query}${innerQuery.query}`;
      }

      if (Object.keys(param).length === 1) {
        const [key, value] = Object.entries(param)[0];

        return `${query}${addBind(value, key)}`;
      }
    }

    if (
      typeof param === "function" ||
      typeof param === "symbol" ||
      typeof param === "object"
    ) {
      throw new FailBindData(
        "Parâmetro é um objeto, deveria ser um array ou um valor puro"
      );
    }

    return query;
  }

  const query = queries
    .map((item, index) => {
      if (index === 0 && !Array.isArray(params)) {
        return `${item}${addBind(params)}`;
      }
      const param = params[index];

      return handleQueryParam(item, param);
    })
    .join("");

  return { query, bind };
}

export function joinSql(constructors: ConstructorReturn[], joinString: string) {
  return constructors.reduce(
    (acc, { bind, query }, index) => {
      if (index === 0) return { bind, query };

      return {
        bind: { ...acc.bind, ...bind },
        query: `${acc.query}${joinString}${query}`,
      };
    },
    { query: "", bind: {} } as ConstructorReturn
  );
}
