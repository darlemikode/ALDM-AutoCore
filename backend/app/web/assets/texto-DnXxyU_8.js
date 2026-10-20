const n=e=>String(e??"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim(),r=(e,o)=>n(e).includes(n(o));export{r as c};
