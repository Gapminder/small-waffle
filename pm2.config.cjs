module.exports = {
    apps : [{
      name: "small-waffle",
      script: "index.js",
      node_args: "--max_old_space_size=6144",
      args: "",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '6100M',
      env: {
          PORT: 3333,
          VERBOSITY: 2
      },
      error_file: "/home/gapminder/logs/error.log",
      out_file: "/home/gapminder/logs/output.log",
      time: true
    },{
      name: "gitops-sidecar",
      script: "git-ops-sidecar-process.index.js",
      instances: 1, // keep 1 writer to avoid .git lock fights
      autorestart: true,
      watch: false, // change to true if you want live reload in dev
      max_memory_restart: "400M",
      env: {
        SIDECAR_PORT: 3334
      },
      error_file: "/home/gapminder/logs/gitops-sidecar.error.log",
      out_file: "/home/gapminder/logs/gitops-sidecar.output.log",
      time: true
    }]
  };