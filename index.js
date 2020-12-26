"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = __importDefault(require("@actions/core"));
const exec_1 = require("@actions/exec");
const github_1 = __importDefault(require("@actions/github"));
const graphql_request_1 = require("graphql-request");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const t = __importStar(require("runtypes"));
const Post = t.Record({
    "cuid": t.String,
    "slug": t.String,
    "contentMarkdown": t.String,
});
const PostsResp = t.Record({
    data: t.Record({
        user: t.Record({
            publication: t.Record({
                posts: t.Array(Post)
            })
        })
    })
});
const PostsByName = t.Dictionary(Post);
async function run() {
    try {
        const hashnodeAuth = core_1.default.getInput('hashnodeAuth', { required: true });
        const hashnodeUsername = core_1.default.getInput('hashnodeUsername', { required: true });
        const postsPath = core_1.default.getInput('postsPath') || 'posts';
        const { owner, repo } = github_1.default.context.repo;
        exec_1.exec(`git clone https://github.com/${owner}/${repo}.git ~/${repo}`);
        const postsLocation = path_1.default.join(`~`, repo, postsPath);
        const files = await fs_1.promises.readdir(postsLocation);
        const filesMd = files.filter(fileName => fileName.endsWith('.md'));
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
            posts.push(...resp.data.user.publication.posts);
            isAllPagesFetched = resp.data.user.publication.posts.length === 0;
        }
        core_1.default.debug(`POSTS: ${JSON.stringify(posts)}`);
        core_1.default.debug(`FILES: ${JSON.stringify(filesMd)}`);
        const postsByName = posts.reduce((acc, post) => {
            acc[post.slug] = post;
            return acc;
        }, PostsByName.check({}));
        for (const fileName of filesMd) {
            const postName = fileName.replace('.md', '');
            if (postName in postsByName) {
                const fileData = (await fs_1.promises.readFile(path_1.default.join(postsLocation, fileName))).toString();
                if (postsByName[postName].contentMarkdown !== fileData) {
                    core_1.default.debug(`UPDATE: ${postName}`);
                }
                core_1.default.debug(`EXIST: ${postName}`);
            }
            else {
                core_1.default.debug(`CREATE: ${postName}`);
            }
        }
    }
    catch (error) {
        core_1.default.setFailed(error.message);
    }
}
run();
