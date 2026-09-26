# env-git-push

## 本机（沙箱）git push 失败 → 先确认远程走 SSH 而非 HTTPS

- 症状（2026-09 实锤）：`git push`（HTTPS）三次失败形态各异——GnuTLS recv error (-110) → 120s 超时 → Couldn't connect；`curl`/`node fetch` 同域名秒通。根因是本机 git/libcurl 的 GnuTLS 栈与出口网络的 TLS 握手被断；SSH 与 OpenSSL 通路不受影响。
- **正解**：换 SSH remote（`git@github.com:wenliangw/dsh-video-design.git`）。本机 `~/.ssh/id_ed25519` 已注册在主账号（wenliangw），22 端口可达，`ssh -T git@github.com` 一次通过。
- 沙箱注意：`~/.ssh` 与 `~` 均不可写 → known_hosts 驻留工作区 `.ssh/known_hosts`（已 gitignore），用仓库级配置指过去：
  `git config core.sshCommand "ssh -i /home/7c/.ssh/id_ed25519 -o IdentitiesOnly=yes -o UserKnownHostsFile=/home/7c/dsh-video-design/.ssh/known_hosts"`
- API 直推（blobs → 递归建树 → commit → PATCH ref + 内容等价校验）仍可用作**紧急备路**（当时 81 次调用完成推送），但正常路径一律 SSH。
- 为什么：git/config 里曾内嵌明文 PAT 的 HTTPS remote + ~/.git-credentials 明文副本，均已在本次切换中清除并建议用户撤销该 PAT；SSH 是这台机器上唯一的稳定通路。