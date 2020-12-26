"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core = require("@actions/core");
const exec_1 = require("@actions/exec");
const github = require("@actions/github");
const graphql_request_1 = require("graphql-request");
const fs_1 = require("fs");
const t = require("runtypes");
const Post = t.Record({
    "cuid": t.String,
    "slug": t.String,
    "contentMarkdown": t.String,
});
const PostsResp = t.Record({
    user: t.Record({
        publication: t.Record({
            posts: t.Array(Post)
        })
    })
});
const PostsByName = t.Dictionary(Post);
const debug = (message) => core.debug(`[code] ${message}`);
async function run() {
    try {
        const hashnodeAuth = core.getInput('hashnodeAuth', { required: true });
        const hashnodeUsername = core.getInput('hashnodeUsername', { required: true });
        const postsPath = core.getInput('postsPath') || 'posts';
        const { owner, repo } = github.context.repo;
        const repoUrl = `https://github.com/${owner}/${repo}.git`;
        const repoLocation = `/tmp/gha-hashnode-publish-repo`;
        const postsLocation = `${repoLocation}/${postsPath}`;
        debug(`Clone repo: ${repoUrl}`);
        await exec_1.exec(`git clone ${repoUrl} ${repoLocation}`);
        debug(`Read posts location directory: ${postsLocation}`);
        const files = await fs_1.promises.readdir(postsLocation);
        const filesMd = files.filter(fileName => fileName.endsWith('.md'));
        debug(`Fetch posts`);
        const posts = [];
        for (let isAllPagesFetched = false, i = 0; !isAllPagesFetched; i++) {
            const resp = PostsResp.check(await graphql_request_1.request('https://api.hashnode.com', `
          query($username:String!, $page: Int!) {
            user(username:$username) {
              publication {
                posts(page:$page) {
                  cuid
                  slug
                  contentMarkdown
                }
              }
            }
          }
        `, { username: hashnodeUsername, page: i }));
            posts.push(...resp.user.publication.posts);
            isAllPagesFetched = resp.user.publication.posts.length === 0;
        }
        debug(`Posts: ${JSON.stringify(posts)}`);
        debug(`Files: ${JSON.stringify(filesMd)}`);
        const postsByName = posts.reduce((acc, post) => {
            acc[post.slug] = post;
            return acc;
        }, PostsByName.check({}));
        for (const fileName of filesMd) {
            const postName = fileName.replace('.md', '');
            if (postName in postsByName) {
                const fileData = (await fs_1.promises.readFile(`${postsLocation}/${fileName}`)).toString();
                if (postsByName[postName].contentMarkdown !== fileData) {
                    debug(`UPDATE: ${postName}`);
                }
                debug(`EXIST: ${postName}`);
            }
            else {
                debug(`CREATE: ${postName}`);
            }
        }
    }
    catch (error) {
        core.setFailed(error);
    }
}
run();
