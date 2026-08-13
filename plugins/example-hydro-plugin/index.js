class HelloHandler{async get(){this.response.body={message:'Hydro-style plugin API is active',plugin:'@infinte/example-hydro-plugin'}}}
export async function apply(ctx){ctx.Route('plugin_hello','/api/plugin/hello',HelloHandler);ctx.injectUI('UserDropdown','plugin_hello',{icon:'plug',displayName:'Plugin API'});ctx.on('infinte/ready',()=>{});}
