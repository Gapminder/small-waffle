export const resultTransformer = function(result) {
  const header = Object.keys(result[0] || {});

  const rows = result.map((record) => {
    const values = [];
    for (const key of header) {
      let value = record[key];
      if (record[key] instanceof Date)
        value = +record[key].getUTCFullYear();
      if (typeof record[key] === "boolean")
        value = +record[key];
      // numbers and strings are all good!

      values.push(value);
    }
    return values;
  });

  return { header, rows, version: "" };
};
